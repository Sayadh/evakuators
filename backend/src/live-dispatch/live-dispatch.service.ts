/**
 * The application layer: one method per API operation. Controllers do
 * transport (auth → ids, headers, status codes); everything else is here and
 * is framework-free, so the same code is exercised by the integration tests.
 *
 * Every mutation runs through `runIdempotent`: the Idempotency-Key, the change
 * and the stored response commit together; the same key with a different
 * body is refused; a retry gets the original business result.
 */
import { availabilityOf } from './fleet/fleet.repository'
import { trackingPolicy, type IncomingFix } from './fleet/domain/gps'
import { MANUAL_OVERRIDABLE } from './fleet/domain/availability'
import { cancelSchema, createOrderSchema, driverRequestSchema, updateOrderSchema } from './orders/domain/order-input'
import type { AttentionKind } from './orders/domain/order-state'
import { adminOrderView, driverActiveOrderView, driverOfferOrderView, readOrder } from './orders/order-row'
import { DispatchError } from './platform/errors'
import { asResponse, requestFingerprint, runIdempotent, type StoredResponse } from './platform/idempotency'
import { toDate, toNullableNumber, toNumber } from './platform/params'
import type { LiveDispatchRuntime } from './runtime'
import type { ZodTypeAny, z } from 'zod'

export interface MutationContext {
  idempotencyKey: string | undefined
  method: string
  route: string
  body: unknown
}

function parse<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new DispatchError('VALIDATION_FAILED', {
      issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    })
  }
  return result.data
}

function requireKey(ctx: MutationContext): string {
  if (!ctx.idempotencyKey) throw new DispatchError('VALIDATION_FAILED', { header: 'Idempotency-Key is required' })
  return ctx.idempotencyKey
}

export class LiveDispatchService {
  constructor(private readonly rt: LiveDispatchRuntime) {}

  private mutate(scope: string, ctx: MutationContext, op: Parameters<typeof runIdempotent>[2]): Promise<StoredResponse & { replayed: boolean }> {
    return runIdempotent(
      this.rt.db,
      { scope, key: requireKey(ctx), fingerprint: requestFingerprint(ctx.method, ctx.route, ctx.body) },
      op,
    )
  }

  // ─── Driver app ───────────────────────────────────────────────────────────

  /**
   * Everything the app needs to render, in one read — used on launch, on
   * every WebSocket (re)connect and when opened from a push. The app never
   * assumes it saw every event.
   */
  async driverSnapshot(driverId: number) {
    const settings = await this.rt.settings.get()
    const state = await this.rt.fleet.driverState(driverId)
    if (!state) throw new DispatchError('FORBIDDEN')
    const availability = availabilityOf(state, settings)
    // Not eligible by GPS alone, but connected with a base location: dispatch
    // may still reach him via the base fallback (eligibility-sql.ts, source
    // BASE) — the app says so instead of a flat "you will not get orders".
    const gpsOnly = ['GPS_MISSING', 'GPS_STALE', 'GPS_INACCURATE', 'GPS_SUSPICIOUS']
    const baseFallback =
      !availability.eligible && state.hasBase === true && availability.reasons.length > 0 && availability.reasons.every((r) => gpsOnly.includes(r))
    const offer = await this.rt.offers.currentOfferFor(driverId)
    let currentOffer: Record<string, unknown> | null = null
    if (offer && offer.beforeDeadline) {
      const order = await readOrder(this.rt.db, offer.orderId)
      if (order) {
        currentOffer = {
          offerId: offer.id,
          expiresAt: offer.expiresAt.toISOString(),
          // The countdown is computed against THIS, not the phone's clock
          serverTime: state.now.toISOString(),
          manual: offer.manual,
          toPickup: {
            roadMeters: offer.roadMeters,
            etaSeconds: offer.etaSeconds,
            approximate: true,
            // a straight line is never presented as a road figure
            straightLineMeters: offer.etaSeconds === null ? offer.straightLineMeters : null,
          },
          order: driverOfferOrderView(order),
        }
      }
    }
    const active = await this.rt.orders.activeOrderFor(driverId)
    return {
      serverTime: state.now.toISOString(),
      driver: { name: state.driverName, kind: state.kind },
      availability: { ...availability, baseFallback },
      switches: { wantsOnline: state.wantsOnline, externalBusy: state.externalBusy },
      trackingConsentVersion: state.trackingConsentVersion,
      currentOffer,
      activeOrder: active ? driverActiveOrderView(active) : null,
      tracking: trackingPolicy({ wantsOnline: state.wantsOnline, hasActiveOrder: active !== null, lastSpeedMps: state.speedMps }),
    }
  }

  async ingestLocations(driverId: number, sessionId: string, fixes: IncomingFix[]) {
    if (!this.rt.config.trackingEnabled) throw new DispatchError('FEATURE_DISABLED')
    return this.rt.fleet.ingestLocations(driverId, sessionId, fixes, await this.rt.settings.get())
  }

  async driverAccept(driverId: number, offerId: string, ctx: MutationContext) {
    return this.mutate(`driver:${driverId}:offer`, ctx, (tx) =>
      asResponse(tx, async () => {
        const result = await this.rt.offers.accept(offerId, driverId, tx)
        if (!result.ok) return result
        return { orderId: result.orderId, status: result.status }
      }),
    )
  }

  async driverReject(driverId: number, offerId: string, reason: string | null, ctx: MutationContext) {
    return this.mutate(`driver:${driverId}:offer`, ctx, (tx) =>
      asResponse(tx, async () => {
        const result = await this.rt.offers.reject(offerId, driverId, reason, tx)
        if (!result.ok) return result
        return { offerId, status: 'REJECTED' }
      }),
    )
  }

  async driverProgress(driverId: number, orderId: number, action: 'EN_ROUTE' | 'ARRIVED' | 'START_TRANSPORT' | 'COMPLETE', ctx: MutationContext) {
    return this.mutate(`driver:${driverId}:order`, ctx, (tx) =>
      asResponse(tx, async () => {
        const order = await this.rt.orders.progress(tx, orderId, action, { type: 'DRIVER', id: driverId })
        return driverActiveOrderView(order)
      }),
    )
  }

  /** The driver records the price he agreed with the customer by phone */
  async driverConfirmPrice(driverId: number, orderId: number, agreedPriceAmd: number, ctx: MutationContext) {
    return this.mutate(`driver:${driverId}:order`, ctx, (tx) =>
      asResponse(tx, async () =>
        driverActiveOrderView(await this.rt.orders.confirmPrice(tx, orderId, agreedPriceAmd, undefined, { type: 'DRIVER', id: driverId })),
      ),
    )
  }

  async driverRequest(driverId: number, orderId: number, body: unknown, ctx: MutationContext) {
    const input = parse(driverRequestSchema, body)
    const settings = await this.rt.settings.get()
    return this.mutate(`driver:${driverId}:order`, ctx, (tx) =>
      asResponse(
        tx,
        async () => {
          const order = await this.rt.orders.driverRequest(tx, orderId, driverId, input, settings)
          // A redispatched cancel leaves the order without this driver: answer
          // with what is still his to see — nothing (the app re-reads /me).
          return order.assignedDriverId === driverId ? driverActiveOrderView(order) : { released: true, orderId: order.id }
        },
        201,
      ),
    )
  }

  async driverHistory(driverId: number, limit: number, before: Date | null) {
    const rows = await this.rt.orders.historyFor(driverId, limit, before)
    // History shows the job, not the customer: contact data is for the live order only.
    return rows.map((order) => ({
      id: order.id,
      number: order.number,
      status: order.status,
      pickupAddress: order.pickupAddress,
      destinationAddress: order.destinationAddress,
      price: { mode: order.pricingMode, amountAmd: order.agreedPriceAmd ?? order.quotedPriceAmd },
      completedAt: order.completedAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
    }))
  }

  // ─── Admin console ────────────────────────────────────────────────────────

  async createOrder(adminUserId: number, body: unknown, ctx: MutationContext) {
    const input = parse(createOrderSchema, body)
    return this.mutate(`admin:${adminUserId}:order-create`, ctx, (tx) =>
      asResponse(tx, async () => adminOrderView(await this.rt.orders.create(tx, input, adminUserId)), 201),
    )
  }

  async updateOrder(adminUserId: number, orderId: number, body: unknown, ctx: MutationContext) {
    const input = parse(updateOrderSchema, body)
    return this.mutate(`admin:${adminUserId}:order`, ctx, (tx) =>
      asResponse(tx, async () => adminOrderView(await this.rt.orders.update(tx, orderId, input, adminUserId))),
    )
  }

  async startDispatch(adminUserId: number, orderId: number, expectedVersion: number, ctx: MutationContext) {
    if (!this.rt.config.enabled) throw new DispatchError('FEATURE_DISABLED')
    const settings = await this.rt.settings.get()
    return this.mutate(`admin:${adminUserId}:order`, ctx, (tx) =>
      asResponse(tx, async () => adminOrderView(await this.rt.orders.startDispatch(tx, orderId, expectedVersion, adminUserId, settings))),
    )
  }

  async stopDispatch(adminUserId: number, orderId: number, expectedVersion: number, ctx: MutationContext) {
    return this.mutate(`admin:${adminUserId}:order`, ctx, (tx) =>
      asResponse(tx, async () => adminOrderView(await this.rt.orders.stopDispatch(tx, orderId, expectedVersion, adminUserId))),
    )
  }

  async cancelOrder(adminUserId: number, orderId: number, body: unknown, ctx: MutationContext) {
    const input = parse(cancelSchema, body)
    return this.mutate(`admin:${adminUserId}:order`, ctx, (tx) =>
      asResponse(tx, async () => adminOrderView(await this.rt.orders.cancel(tx, orderId, input, adminUserId))),
    )
  }

  async confirmPrice(adminUserId: number, orderId: number, agreedPriceAmd: number, expectedVersion: number, ctx: MutationContext) {
    return this.mutate(`admin:${adminUserId}:order`, ctx, (tx) =>
      asResponse(tx, async () => adminOrderView(await this.rt.orders.confirmPrice(tx, orderId, agreedPriceAmd, expectedVersion, { type: 'ADMIN', id: adminUserId }))),
    )
  }

  async setPayment(adminUserId: number, orderId: number, status: 'UNKNOWN' | 'UNPAID' | 'PAID', expectedVersion: number, ctx: MutationContext) {
    if (!['UNKNOWN', 'UNPAID', 'PAID'].includes(status)) throw new DispatchError('VALIDATION_FAILED', { field: 'status' })
    return this.mutate(`admin:${adminUserId}:order`, ctx, (tx) =>
      asResponse(tx, async () => adminOrderView(await this.rt.orders.setPaymentStatus(tx, orderId, status, expectedVersion, adminUserId))),
    )
  }

  async adminProgress(adminUserId: number, orderId: number, action: 'EN_ROUTE' | 'ARRIVED' | 'START_TRANSPORT' | 'COMPLETE', expectedVersion: number, ctx: MutationContext) {
    return this.mutate(`admin:${adminUserId}:order`, ctx, (tx) =>
      asResponse(tx, async () => adminOrderView(await this.rt.orders.progress(tx, orderId, action, { type: 'ADMIN', id: adminUserId }, expectedVersion))),
    )
  }

  async releaseAssignment(adminUserId: number, orderId: number, body: { confirm: true; reason: string; restartSearch: boolean; expectedVersion: number }, ctx: MutationContext) {
    if (typeof body?.reason !== 'string' || body.reason.trim().length < 3) throw new DispatchError('VALIDATION_FAILED', { field: 'reason' })
    const settings = await this.rt.settings.get()
    return this.mutate(`admin:${adminUserId}:order`, ctx, (tx) =>
      asResponse(tx, async () =>
        adminOrderView(await this.rt.orders.releaseAssignment(tx, orderId, { ...body, restartSearch: Boolean(body.restartSearch) }, adminUserId, settings)),
      ),
    )
  }

  async resume(adminUserId: number, orderId: number, note: string, expectedVersion: number, ctx: MutationContext) {
    return this.mutate(`admin:${adminUserId}:order`, ctx, (tx) =>
      asResponse(tx, async () => adminOrderView(await this.rt.orders.resumeFromAttention(tx, orderId, note ?? '', expectedVersion, adminUserId))),
    )
  }

  async flag(adminUserId: number, orderId: number, kind: AttentionKind, note: string, expectedVersion: number, ctx: MutationContext) {
    return this.mutate(`admin:${adminUserId}:order`, ctx, (tx) =>
      asResponse(tx, async () => adminOrderView(await this.rt.orders.flagAttention(tx, orderId, kind, note ?? '', expectedVersion, adminUserId))),
    )
  }

  async overrideRequirements(adminUserId: number, orderId: number, note: string, expectedVersion: number, ctx: MutationContext) {
    return this.mutate(`admin:${adminUserId}:order`, ctx, (tx) =>
      asResponse(tx, async () => adminOrderView(await this.rt.orders.overrideRequirements(tx, orderId, note ?? '', expectedVersion, adminUserId))),
    )
  }

  /**
   * Manual offer. The road ETA is computed BEFORE the transaction (best
   * effort — on provider failure the offer goes out without one, and says so).
   */
  async manualOffer(adminUserId: number, orderId: number, body: { driverId: number; overrideReason?: string | null; expectedVersion: number }, ctx: MutationContext) {
    if (!this.rt.config.enabled) throw new DispatchError('FEATURE_DISABLED')
    if (!Number.isSafeInteger(body?.driverId)) throw new DispatchError('VALIDATION_FAILED', { field: 'driverId' })
    const settings = await this.rt.settings.get()
    const order = await readOrder(this.rt.db, orderId)
    if (!order) throw new DispatchError('ORDER_NOT_FOUND')
    const state = await this.rt.fleet.driverState(body.driverId)
    let route: { meters: number; seconds: number; computedAt: Date } | null = null
    if (state?.latitude != null && state.longitude != null && order.pickupLatitude !== null && order.pickupLongitude !== null) {
      const matrix = await this.rt.routing.matrix([{ latitude: state.latitude, longitude: state.longitude }], {
        latitude: order.pickupLatitude,
        longitude: order.pickupLongitude,
      })
      const entry = matrix.entries[0]
      if (entry?.ok) route = { meters: entry.meters, seconds: entry.seconds, computedAt: matrix.computedAt }
    }
    return this.mutate(`admin:${adminUserId}:order`, ctx, (tx) =>
      asResponse(
        tx,
        async () =>
          this.rt.offers.manualOffer(
            tx,
            { orderId, driverId: body.driverId, adminUserId, overrideReason: body.overrideReason ?? null, expectedVersion: body.expectedVersion, route },
            settings,
          ),
        201,
      ),
    )
  }

  /** Pickup → destination road figures for the description; never invented when unknown */
  async computeOrderRoute(adminUserId: number, orderId: number) {
    const order = await readOrder(this.rt.db, orderId)
    if (!order) throw new DispatchError('ORDER_NOT_FOUND')
    if (order.destinationLatitude === null || order.destinationLongitude === null) {
      return { computed: false, reason: 'NO_DESTINATION' }
    }
    if (order.pickupLatitude === null || order.pickupLongitude === null) {
      return { computed: false, reason: 'NO_PICKUP' }
    }
    const matrix = await this.rt.routing.matrix([{ latitude: order.pickupLatitude, longitude: order.pickupLongitude }], {
      latitude: order.destinationLatitude,
      longitude: order.destinationLongitude,
    })
    const entry = matrix.entries[0]
    if (!entry?.ok) return { computed: false, reason: entry?.error ?? 'PROVIDER_ERROR' }
    const stored = await this.rt.orders.setRoute(
      orderId,
      { meters: entry.meters, seconds: entry.seconds, provider: matrix.provider, manual: false, computedAt: matrix.computedAt, termsVersion: order.termsVersion },
      { type: 'ADMIN', id: adminUserId },
    )
    return { computed: stored, meters: entry.meters, seconds: entry.seconds, provider: matrix.provider }
  }

  /** An operator types the distance (provider down) — stored and shown as manual */
  async setManualRoute(adminUserId: number, orderId: number, meters: number, seconds: number | null) {
    if (!Number.isFinite(meters) || meters <= 0 || meters > 1_000_000) throw new DispatchError('VALIDATION_FAILED', { field: 'meters' })
    if (seconds !== null && (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86_400)) throw new DispatchError('VALIDATION_FAILED', { field: 'seconds' })
    const order = await readOrder(this.rt.db, orderId)
    if (!order) throw new DispatchError('ORDER_NOT_FOUND')
    const stored = await this.rt.orders.setRoute(
      orderId,
      { meters, seconds, provider: null, manual: true, computedAt: new Date(), termsVersion: order.termsVersion },
      { type: 'ADMIN', id: adminUserId },
    )
    return { stored }
  }

  async orderDetail(orderId: number) {
    const order = await readOrder(this.rt.db, orderId)
    if (!order) throw new DispatchError('ORDER_NOT_FOUND')
    const [offers, timeline, candidates] = await Promise.all([
      this.rt.offers.offersOfOrder(orderId),
      this.rt.orders.timeline(orderId),
      this.rt.db.query<Record<string, unknown>>(
        `SELECT c."driverId", c."batch", c."rank", c."straightLineMeters", c."roadMeters", c."etaSeconds", c."routeOk",
                c."routeError", c."routedAt", c."status", c."skipReason", c."locationSource", t."driverName"
           FROM "DispatchCandidate" c JOIN "DispatchAttempt" a ON a."id" = c."attemptId" JOIN "FleetDriverProfile" t ON t."id" = c."driverId"
          WHERE a."orderId" = $1::int AND a."id" = (SELECT max("id") FROM "DispatchAttempt" WHERE "orderId" = $1::int)
          ORDER BY c."rank"`,
        [orderId],
      ),
    ])
    return {
      order: adminOrderView(order),
      offers: offers.map((o) => ({
        id: o.id,
        driverId: o.driverId,
        status: o.status,
        manual: o.manual,
        termsVersion: o.termsVersion,
        createdAt: o.createdAt.toISOString(),
        expiresAt: o.expiresAt.toISOString(),
        respondedAt: o.respondedAt?.toISOString() ?? null,
        etaSeconds: o.etaSeconds,
        roadMeters: o.roadMeters,
        closeReason: o.closeReason,
      })),
      candidates: candidates.map((c) => ({
        driverId: toNumber(c.driverId),
        driverName: String(c.driverName),
        rank: toNumber(c.rank),
        straightLineMeters: toNumber(c.straightLineMeters),
        roadMeters: toNullableNumber(c.roadMeters),
        etaSeconds: toNullableNumber(c.etaSeconds),
        routeOk: Boolean(c.routeOk),
        routeError: c.routeError ?? null,
        routedAt: c.routedAt ? toDate(c.routedAt).toISOString() : null,
        status: String(c.status),
        skipReason: c.skipReason ?? null,
        locationSource: c.locationSource === 'BASE' ? 'BASE' : 'GPS',
      })),
      timeline,
    }
  }

  async listOrders(query: { status?: string; search?: string; limit?: number; cursor?: string }) {
    const statuses = query.status ? query.status.split(',').filter(Boolean) : undefined
    let cursor: { createdAt: Date; id: number } | null = null
    if (query.cursor) {
      const [at, id] = Buffer.from(query.cursor, 'base64url').toString('utf8').split('|')
      if (at && id && !Number.isNaN(Date.parse(at))) cursor = { createdAt: new Date(at), id: Number(id) }
    }
    const limit = Math.min(Math.max(Number(query.limit ?? 25), 1), 100)
    const rows = await this.rt.orders.list({ statuses: statuses as never, search: query.search, limit, cursor })
    const last = rows[rows.length - 1]
    return {
      items: rows.map(adminOrderView),
      nextCursor: rows.length === limit && last ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString('base64url') : null,
    }
  }

  async driverMap(query: { bbox?: string; onlyOnline?: boolean; limit?: number; offset?: number }) {
    const settings = await this.rt.settings.get()
    let bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number } | undefined
    if (query.bbox) {
      const [minLat, minLng, maxLat, maxLng] = query.bbox.split(',').map(Number)
      if ([minLat, minLng, maxLat, maxLng].some((v) => !Number.isFinite(v))) throw new DispatchError('VALIDATION_FAILED', { field: 'bbox' })
      bbox = { minLat, minLng, maxLat, maxLng }
    }
    const rows = await this.rt.fleet.listForMap({
      bbox,
      onlyWantsOnline: query.onlyOnline,
      limit: Math.min(Number(query.limit ?? 500), 500),
      offset: Number(query.offset ?? 0),
    })
    return {
      serverTime: new Date().toISOString(),
      gpsMaxAgeSeconds: settings.gpsMaxAgeSeconds,
      items: rows.map((row) => {
        const availability = availabilityOf(row, settings)
        return {
          driverId: row.driverId,
          kind: row.kind,
          towTruckId: row.towTruckId,
          slug: row.slug,
          driverName: row.driverName,
          phone: row.phone,
          vehicleType: row.vehicleType,
          position:
            row.latitude === null
              ? null
              : { latitude: row.latitude, longitude: row.longitude, accuracyM: row.accuracyM, measuredAt: row.measuredAt?.toISOString() ?? null },
          availability,
          activeOrderId: row.activeOrderId,
          manualOverridable: availability.reasons.every((r) => MANUAL_OVERRIDABLE.includes(r)),
        }
      }),
    }
  }
}
