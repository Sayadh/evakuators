/**
 * The application layer: one method per API operation. Controllers do
 * transport (auth → ids, headers, status codes); everything else is here and
 * is framework-free, so the same code is exercised by the integration tests.
 *
 * Every mutation runs through `runIdempotent`: the Idempotency-Key, the change
 * and the stored response commit together; the same key with a different
 * body is refused; a retry gets the original business result.
 */
import { randomUUID } from 'node:crypto'
import { enqueue, enqueueRealtime } from './notify/outbox'
import { availabilityOf } from './fleet/fleet.repository'
import { trackingPolicy, type IncomingFix } from './fleet/domain/gps'
import { MANUAL_OVERRIDABLE } from './fleet/domain/availability'
import { cancelSchema, createOrderSchema, driverRequestSchema, updateOrderSchema } from './orders/domain/order-input'
import type { AttentionKind } from './orders/domain/order-state'
import { missedOutcome, missedReason } from './orders/domain/missed'
import { adminOrderView, driverActiveOrderView, driverOfferOrderView, readOrder } from './orders/order-row'
import { DispatchError } from './platform/errors'
import { asResponse, requestFingerprint, runIdempotent, type StoredResponse } from './platform/idempotency'
import { toDate, toNullableNumber, toNumber } from './platform/params'
import type { LiveDispatchRuntime } from './runtime'
import type { ZodTypeAny, z } from 'zod'
import { feeForOffer, feePrice, validTopupAmount } from './wallet/domain/fees'
import { creditLimitSchema, priceReviewSchema, walletAdjustSchema } from './wallet/domain/wallet-input'
import type { DispatchSettings } from './platform/settings'
import { entriesOf, lowThresholdOf, post, setCreditLimit, walletOf, type WalletEntry } from './wallet/wallet-ledger'
import { createTopup, topupBill, topupsOf } from './wallet/wallet-topups'

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
    // Driver wallet (2026-11-12): with billing on, a balance below the base
    // fee means no offers — said as its own reason, with its own action (top up).
    const walletInfo = await this.walletSummary(driverId, settings)
    const walletLow = walletInfo.billingEnabled && walletInfo.balanceAmd + walletInfo.creditLimitAmd < walletInfo.fees.baseAmd
    const baseFallback =
      !walletLow &&
      !availability.eligible &&
      state.hasBase === true &&
      availability.reasons.length > 0 &&
      availability.reasons.every((r) => gpsOnly.includes(r))
    let offer = await this.rt.offers.currentOfferFor(driverId)
    // The app reading the offer is proof it reached the phone: start the
    // answer window now, then show the deadline that resulted.
    if (offer && offer.beforeDeadline && offer.deliveredAt === null && (await this.rt.offers.markDelivered(offer.id, driverId, settings))) {
      offer = await this.rt.offers.currentOfferFor(driverId)
    }
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
          // Driver wallet: what accepting costs (null = billing off). Without
          // an agreed price it is the base fee, settled once the price is known.
          fee: walletInfo.billingEnabled
            ? { amountAmd: feeForOffer(order, settings) ?? 0, provisional: feePrice(order) === null }
            : null,
        }
      }
    }
    const active = await this.rt.orders.activeOrderFor(driverId)
    return {
      serverTime: state.now.toISOString(),
      // hasBase: GPS lost → dispatch measures from his base (the app explains it instead of «no orders»)
      driver: {
        name: state.driverName,
        kind: state.kind,
        hasBase: state.hasBase === true,
        // Blocked by an operator (2026-11-12): the app shows why and until when, and keeps him offline
        blocked: state.dispatchSuspendedAt
          ? { reason: state.dispatchSuspendedReason ?? null, until: state.dispatchSuspendedUntil?.toISOString() ?? null, since: state.dispatchSuspendedAt.toISOString() }
          : null,
      },
      availability: {
        ...availability,
        eligible: availability.eligible && !walletLow,
        reasons: walletLow ? [...availability.reasons, 'BALANCE_LOW' as const] : availability.reasons,
        baseFallback,
      },
      wallet: { billingEnabled: walletInfo.billingEnabled, balanceAmd: walletInfo.balanceAmd, creditLimitAmd: walletInfo.creditLimitAmd, low: walletLow },
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
    const settings = await this.rt.settings.get()
    return this.mutate(`driver:${driverId}:offer`, ctx, (tx) =>
      asResponse(tx, async () => {
        const result = await this.rt.offers.accept(offerId, driverId, tx, settings)
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
    const settings = await this.rt.settings.get()
    return this.mutate(`driver:${driverId}:order`, ctx, (tx) =>
      asResponse(tx, async () =>
        driverActiveOrderView(await this.rt.orders.confirmPrice(tx, orderId, agreedPriceAmd, undefined, { type: 'DRIVER', id: driverId }, settings)),
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
      // Additive (2026-11, the app's order details): the job itself — still
      // no customer contact — and the paging cursor (`?before=`).
      assignedAt: order.assignedStartedAt.toISOString(),
      vehicle: { make: order.vehicleMake, model: order.vehicleModel },
      problemDescription: order.problemDescription,
      cancelReason: order.cancelReason,
      route: order.routeMeters !== null ? { meters: order.routeMeters, seconds: order.routeSeconds } : null,
      timeline: {
        assignedAt: order.assignedAt?.toISOString() ?? null,
        enRouteAt: order.enRouteAt?.toISOString() ?? null,
        arrivedAt: order.arrivedAt?.toISOString() ?? null,
        transportStartedAt: order.transportStartedAt?.toISOString() ?? null,
      },
    }))
  }

  /**
   * Offers the driver let run out — «Բաց թողնված պատվերներ» (2026-11). The
   * job and why it was missed, never the customer's contact; `outcome` says
   * what became of the order, never who took it.
   */
  async driverMissedOffers(driverId: number, limit: number, before: Date | null) {
    const rows = await this.rt.orders.missedOffersFor(driverId, limit, before)
    return rows.map((m) => ({
      offerId: m.offerId,
      offeredAt: m.offeredAt.toISOString(),
      expiresAt: m.expiresAt.toISOString(),
      reason: missedReason(m.deliveredAt, m.closeReason),
      toPickup: {
        roadMeters: m.roadMeters,
        etaSeconds: m.etaSeconds,
        straightLineMeters: m.etaSeconds === null ? m.straightLineMeters : null,
      },
      outcome: missedOutcome(m.order.status, m.takenByOther),
      order: {
        number: m.order.number,
        pickupAddress: m.order.pickupAddress,
        destinationAddress: m.order.destinationAddress,
        vehicle: { make: m.order.vehicleMake, model: m.order.vehicleModel },
        problemDescription: m.order.problemDescription,
        price: { mode: m.order.pricingMode, amountAmd: m.order.agreedPriceAmd ?? m.order.quotedPriceAmd },
        route: m.order.routeMeters !== null ? { meters: m.order.routeMeters, seconds: m.order.routeSeconds } : null,
      },
    }))
  }

  // ─── Driver wallet (2026-11-12) ───────────────────────────────────────────

  /** Balance, whether billing is on, and the fee schedule the driver is charged by */
  async walletSummary(driverId: number, settings?: DispatchSettings) {
    const s = settings ?? (await this.rt.settings.get())
    const wallet = await walletOf(this.rt.db, driverId)
    return {
      billingEnabled: s.walletBillingEnabled === 1,
      balanceAmd: wallet.balanceAmd,
      /** How far below zero an operator lets him go (0 = not at all) */
      creditLimitAmd: wallet.creditLimitAmd,
      fees: {
        freeMaxPriceAmd: s.walletFeeFreeMaxPriceAmd,
        baseAmd: s.walletFeeBaseAmd,
        baseMaxPriceAmd: s.walletFeeBaseMaxPriceAmd,
        percent: s.walletFeePercent,
        roundAmd: s.walletFeeRoundAmd,
        maxAmd: s.walletFeeMaxAmd,
      },
      topup: {
        minAmd: s.walletMinTopupAmd,
        maxAmd: s.walletMaxTopupAmd,
        bonus:
          s.walletTopupBonusEnabled === 1
            ? s.walletTopupBonusThresholdsAmd.map((fromAmd, i) => ({ fromAmd, percent: s.walletTopupBonusPercents[i] ?? 0 }))
            : [],
      },
    }
  }

  /** `GET /driver-app/me/wallet` — summary, the first statement page and the recent top-ups */
  async driverWallet(driverId: number) {
    const [summary, entries, topups] = await Promise.all([
      this.walletSummary(driverId),
      entriesOf(this.rt.db, driverId, 30, null),
      topupsOf(this.rt.db, driverId, 5),
    ])
    return {
      ...summary,
      entries: entries.map(walletEntryView),
      topups: topups.map((t) => ({ paymentId: t.paymentId, amountAmd: t.amountAmd, status: t.status, createdAt: t.createdAt.toISOString() })),
    }
  }

  async driverWalletEntries(driverId: number, limit: number, beforeId: number | null) {
    return (await entriesOf(this.rt.db, driverId, limit, beforeId)).map(walletEntryView)
  }

  /**
   * A new Idram bill for the driver's wallet. Only a website-linked driver
   * can be billed (the payment ledger is per tow truck); the caller turns
   * the bill into a payment page.
   */
  async driverCreateTopup(driverId: number, amountAmd: unknown): Promise<{ paymentId: number; amountAmd: number }> {
    const settings = await this.rt.settings.get()
    if (!validTopupAmount(amountAmd, settings)) {
      throw new DispatchError('VALIDATION_FAILED', { field: 'amountAmd', min: settings.walletMinTopupAmd, max: settings.walletMaxTopupAmd })
    }
    const towTruckId = await this.rt.access.towTruckIdOf(driverId)
    if (towTruckId === null) throw new DispatchError('WALLET_TOPUP_UNAVAILABLE', { reason: 'no site profile' })
    const paymentId = await createTopup(this.rt.db, { driverId, towTruckId, amountAmd })
    return { paymentId, amountAmd }
  }

  /** A bill, only if it is this driver's */
  async driverTopup(driverId: number, paymentId: number) {
    const bill = await topupBill(this.rt.db, paymentId)
    if (!bill || bill.driverId !== driverId) throw new DispatchError('WALLET_TOPUP_NOT_FOUND')
    return { paymentId: bill.paymentId, amountAmd: bill.amountAmd, status: bill.status, createdAt: bill.createdAt.toISOString() }
  }

  /** Operator: credit or debit by hand (cash, correction, goodwill) — always with a note, audited by the ledger line */
  async adminWalletAdjust(adminUserId: number, driverId: number, body: unknown, ctx: MutationContext) {
    const input = parse(walletAdjustSchema, body)
    return this.mutate(`admin:${adminUserId}:wallet:${driverId}`, ctx, (tx) =>
      asResponse(tx, async () => {
        const [driver] = await tx.query(`SELECT 1 FROM "FleetDriver" WHERE "id" = $1::int`, [driverId])
        if (!driver) throw new DispatchError('DRIVER_UNAVAILABLE', { reason: 'not found' })
        const balanceAmd = await post(tx, {
          driverId,
          kind: input.amountAmd > 0 ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT',
          amountAmd: input.amountAmd,
          // The driver reads it under the line; a quick credit may leave it out
          note: input.note?.trim() || (input.amountAmd > 0 ? 'Մուտքագրում ադմինիստրատորի կողմից' : 'Գանձում ադմինիստրատորի կողմից'),
          createdByUserId: adminUserId,
          lowThresholdAmd: lowThresholdOf(await this.rt.settings.get()),
        })
        // The open app re-reads its snapshot (balance) at once; a credit is
        // also announced by push, so the driver knows without opening it.
        const mark = randomUUID()
        await enqueueRealtime(tx, `wallet:adjust:${driverId}:${mark}`, [`driver:${driverId}`], 'wallet.updated', { balanceAmd })
        if (input.amountAmd > 0) {
          await enqueue(tx, {
            topic: 'push.walletCredited',
            payload: { driverId, amountAmd: input.amountAmd, balanceAmd },
            dedupeKey: `wallet-credited:${driverId}:${mark}`,
            maxAttempts: 3,
          })
        }
        return { driverId, balanceAmd }
      }),
    )
  }

  /** Operator: how far below zero this driver may go and still be offered orders */
  async adminSetCreditLimit(adminUserId: number, driverId: number, body: unknown, ctx: MutationContext) {
    const input = parse(creditLimitSchema, body)
    return this.mutate(`admin:${adminUserId}:wallet:${driverId}`, ctx, (tx) =>
      asResponse(tx, async () => {
        const [driver] = await tx.query(`SELECT 1 FROM "FleetDriver" WHERE "id" = $1::int`, [driverId])
        if (!driver) throw new DispatchError('DRIVER_UNAVAILABLE', { reason: 'not found' })
        await setCreditLimit(tx, driverId, input.creditLimitAmd)
        return { driverId, ...(await walletOf(tx, driverId)) }
      }),
    )
  }

  /** Operator: approve or correct a minimum price the driver entered */
  async adminResolvePriceReview(adminUserId: number, reviewId: number, body: unknown, ctx: MutationContext) {
    const input = parse(priceReviewSchema, body)
    return this.mutate(`admin:${adminUserId}:price-review:${reviewId}`, ctx, (tx) =>
      asResponse(tx, async () => adminOrderView(await this.rt.orders.resolvePriceReview(tx, reviewId, input, adminUserId))),
    )
  }

  /**
   * Operator: the wallet's money over the last `days` (Yerevan days) — in
   * (top-ups, bonuses, credits), fees net of settlements and refunds, what
   * drivers owe (negative balances), who is below the base fee, and the
   * minimum prices waiting for a call.
   */
  async adminWalletSummary(days: number) {
    const span = Number.isFinite(days) ? Math.min(Math.max(Math.round(days), 1), 366) : 30
    const settings = await this.rt.settings.get()
    const [totals] = await this.rt.db.query<Record<string, unknown>>(
      `SELECT
         COALESCE(SUM("amountAmd") FILTER (WHERE "kind" = 'TOPUP'), 0) AS "topupsAmd",
         COUNT(*) FILTER (WHERE "kind" = 'TOPUP') AS "topupsCount",
         COALESCE(SUM("amountAmd") FILTER (WHERE "kind" = 'TOPUP_BONUS'), 0) AS "bonusesAmd",
         COALESCE(-SUM("amountAmd") FILTER (WHERE "kind" IN ('ORDER_FEE', 'ORDER_FEE_ADJUSTMENT', 'ORDER_FEE_REFUND')), 0) AS "feesNetAmd",
         COUNT(*) FILTER (WHERE "kind" = 'ORDER_FEE') AS "feeOrders",
         COALESCE(SUM("amountAmd") FILTER (WHERE "kind" = 'ORDER_FEE_REFUND'), 0) AS "refundsAmd",
         COALESCE(SUM("amountAmd") FILTER (WHERE "kind" = 'ADMIN_CREDIT'), 0) AS "adminCreditsAmd",
         COALESCE(-SUM("amountAmd") FILTER (WHERE "kind" = 'ADMIN_DEBIT'), 0) AS "adminDebitsAmd"
       FROM "WalletEntry" WHERE "createdAt" >= now() - make_interval(days => $1::int)`,
      [span],
    )
    const [balances] = await this.rt.db.query<Record<string, unknown>>(
      `SELECT COALESCE(SUM("balanceAmd") FILTER (WHERE "balanceAmd" > 0), 0) AS "heldAmd",
              COALESCE(-SUM("balanceAmd") FILTER (WHERE "balanceAmd" < 0), 0) AS "owedAmd",
              COUNT(*) FILTER (WHERE "balanceAmd" < 0) AS "inDebt",
              COUNT(*) FILTER (WHERE "balanceAmd" + "creditLimitAmd" < $1::int) AS "belowBaseFee"
         FROM "DriverWallet"`,
      [settings.walletFeeBaseAmd],
    )
    const daily = await this.rt.db.query<Record<string, unknown>>(
      `SELECT to_char(("createdAt" AT TIME ZONE 'Asia/Yerevan')::date, 'YYYY-MM-DD') AS "day",
              COALESCE(SUM("amountAmd") FILTER (WHERE "kind" = 'TOPUP'), 0) AS "topupsAmd",
              COALESCE(-SUM("amountAmd") FILTER (WHERE "kind" IN ('ORDER_FEE', 'ORDER_FEE_ADJUSTMENT', 'ORDER_FEE_REFUND')), 0) AS "feesNetAmd",
              COUNT(*) FILTER (WHERE "kind" = 'ORDER_FEE') AS "feeOrders"
         FROM "WalletEntry" WHERE "createdAt" >= now() - make_interval(days => $1::int)
        GROUP BY 1 ORDER BY 1 DESC`,
      [span],
    )
    const [reviews] = await this.rt.db.query<{ n: number }>(`SELECT count(*)::int AS "n" FROM "OrderPriceReview" WHERE "status" = 'PENDING'`)
    const n = (v: unknown) => toNumber(v ?? 0)
    return {
      days: span,
      billingEnabled: settings.walletBillingEnabled === 1,
      totals: {
        topupsAmd: n(totals.topupsAmd),
        topupsCount: n(totals.topupsCount),
        bonusesAmd: n(totals.bonusesAmd),
        feesNetAmd: n(totals.feesNetAmd),
        feeOrders: n(totals.feeOrders),
        refundsAmd: n(totals.refundsAmd),
        adminCreditsAmd: n(totals.adminCreditsAmd),
        adminDebitsAmd: n(totals.adminDebitsAmd),
      },
      balances: { heldAmd: n(balances.heldAmd), owedAmd: n(balances.owedAmd), inDebt: n(balances.inDebt), belowBaseFee: n(balances.belowBaseFee) },
      pendingPriceReviews: n(reviews?.n),
      daily: daily.map((d) => ({ day: String(d.day), topupsAmd: n(d.topupsAmd), feesNetAmd: n(d.feesNetAmd), feeOrders: n(d.feeOrders) })),
    }
  }

  /** Operator: one driver's balance and statement */
  async adminWallet(driverId: number, beforeId: number | null) {
    return {
      ...(await this.walletSummary(driverId)),
      entries: (await entriesOf(this.rt.db, driverId, 50, beforeId)).map(walletEntryView),
      topups: (await topupsOf(this.rt.db, driverId, 20)).map((t) => ({ paymentId: t.paymentId, amountAmd: t.amountAmd, status: t.status, createdAt: t.createdAt.toISOString() })),
    }
  }

  /** Operator: every driver's balance, lowest first (who needs to top up) */
  async adminWallets() {
    const rows = await this.rt.db.query<Record<string, unknown>>(
      `SELECT t."id" AS "driverId", t."driverName", t."phone", t."kind", COALESCE(w."balanceAmd", 0) AS "balanceAmd",
              COALESCE(w."creditLimitAmd", 0) AS "creditLimitAmd", w."updatedAt",
              (SELECT count(*) FROM "OrderAssignment" a WHERE a."driverId" = t."id" AND a."endReason" = 'COMPLETED') AS "completedOrders"
         FROM "FleetDriverProfile" t LEFT JOIN "DriverWallet" w ON w."driverId" = t."id"
        WHERE t."status" <> 'DELETED'
        ORDER BY COALESCE(w."balanceAmd", 0), t."id"
        LIMIT 500`,
    )
    return rows.map((row) => ({
      driverId: toNumber(row.driverId),
      name: row.driverName === null ? null : String(row.driverName),
      phone: row.phone === null ? null : String(row.phone),
      kind: String(row.kind),
      balanceAmd: toNumber(row.balanceAmd),
      creditLimitAmd: toNumber(row.creditLimitAmd),
      /** Completed orders in the app — what an operator weighs before allowing credit */
      completedOrders: toNumber(row.completedOrders),
      updatedAt: row.updatedAt ? toDate(row.updatedAt).toISOString() : null,
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

  async releaseAssignment(
    adminUserId: number,
    orderId: number,
    body: { confirm: true; reason: string; restartSearch: boolean; expectedVersion: number; refundDriverFee?: boolean },
    ctx: MutationContext,
  ) {
    if (typeof body?.reason !== 'string' || body.reason.trim().length < 3) throw new DispatchError('VALIDATION_FAILED', { field: 'reason' })
    const settings = await this.rt.settings.get()
    return this.mutate(`admin:${adminUserId}:order`, ctx, (tx) =>
      asResponse(tx, async () =>
        adminOrderView(
          await this.rt.orders.releaseAssignment(
            tx,
            orderId,
            { ...body, restartSearch: Boolean(body.restartSearch), refundDriverFee: body.refundDriverFee === true },
            adminUserId,
            settings,
          ),
        ),
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
    const [offers, timeline, candidates, assignments, walletEntries, reviews] = await Promise.all([
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
      // Every driver this order was given to, newest first — the operator can
      // call the one who has it (or had it) even after the job is over.
      this.rt.db.query<Record<string, unknown>>(
        `SELECT a."id", a."driverId", a."startedAt", a."endedAt", a."endReason", t."driverName", t."phone"
           FROM "OrderAssignment" a JOIN "FleetDriverProfile" t ON t."id" = a."driverId"
          WHERE a."orderId" = $1::int ORDER BY a."startedAt" DESC`,
        [orderId],
      ),
      // Driver wallet lines for this order (fee, settlement, refund)
      this.rt.db.query<Record<string, unknown>>(
        `SELECT "id", "driverId", "kind", "amountAmd", "note", "createdAt" FROM "WalletEntry" WHERE "orderId" = $1::int ORDER BY "id"`,
        [orderId],
      ),
      // Minimum-price checks for this order (2026-11-12), newest first
      this.rt.db.query<Record<string, unknown>>(
        `SELECT "id", "driverId", "priceAmd", "status", "correctedPriceAmd", "note", "createdAt", "resolvedAt"
           FROM "OrderPriceReview" WHERE "orderId" = $1::int ORDER BY "id" DESC`,
        [orderId],
      ),
    ])
    return {
      order: adminOrderView(order),
      assignments: assignments.map((a) => ({
        id: toNumber(a.id),
        driverId: toNumber(a.driverId),
        name: a.driverName === null ? null : String(a.driverName),
        phone: a.phone === null ? null : String(a.phone),
        active: a.endedAt === null || a.endedAt === undefined,
        startedAt: toDate(a.startedAt).toISOString(),
        endedAt: a.endedAt ? toDate(a.endedAt).toISOString() : null,
        endReason: a.endReason === null || a.endReason === undefined ? null : String(a.endReason),
      })),
      priceReviews: reviews.map((r) => ({
        id: toNumber(r.id),
        driverId: toNumber(r.driverId),
        priceAmd: toNumber(r.priceAmd),
        status: String(r.status),
        correctedPriceAmd: r.correctedPriceAmd === null || r.correctedPriceAmd === undefined ? null : toNumber(r.correctedPriceAmd),
        note: r.note === null || r.note === undefined ? null : String(r.note),
        createdAt: toDate(r.createdAt).toISOString(),
        resolvedAt: r.resolvedAt ? toDate(r.resolvedAt).toISOString() : null,
      })),
      wallet: {
        /** What the drivers paid for this order in total, after settlements and refunds */
        // `0 - x`, not `-x`: an order that cost nothing must read 0, not -0
        netFeeAmd: 0 - walletEntries.reduce((sum, e) => sum + toNumber(e.amountAmd), 0),
        entries: walletEntries.map((e) => ({
          id: toNumber(e.id),
          driverId: toNumber(e.driverId),
          kind: String(e.kind),
          amountAmd: toNumber(e.amountAmd),
          note: e.note === null || e.note === undefined ? null : String(e.note),
          createdAt: toDate(e.createdAt).toISOString(),
        })),
      },
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

function walletEntryView(entry: WalletEntry) {
  return {
    id: entry.id,
    kind: entry.kind,
    amountAmd: entry.amountAmd,
    balanceAfterAmd: entry.balanceAfterAmd,
    orderNumber: entry.orderNumber,
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
  }
}
