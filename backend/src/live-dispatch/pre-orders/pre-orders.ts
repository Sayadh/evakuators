/**
 * Pre-orders (2026-11-17) — collecting prices before there is an order.
 *
 * An operator describes a job (where from/to, the vehicle, its state, a
 * comment) WITHOUT the customer's contact. EVERY active driver sees it and
 * gets a push (2026-11-18: no capability filter — a driver reads the job and
 * decides himself whether it suits him); he answers with the price he would
 * do it for, or skips it. «Կրկին ծանուցել» (`notify`) pushes everyone again. The operator sees every price (drivers never see each
 * other's), then calls the driver or converts the pre-order into a real order
 * at that price, offered to that driver (live-dispatch.service.ts
 * `convertPreOrder`).
 *
 * Deliberately not a DispatchOrder: no status machine, offers, fees or
 * assignment — a pre-order commits nobody to anything.
 *
 * Open = status OPEN. ONLY the operator closes it — no deadline, and
 * converting it into an order does not close it either: the operator may give
 * it to several drivers in turn (the first declined), each a separate order
 * recorded in "PreOrderConversion".
 *
 * Monthly purge (`purgePastMonths`, worker): at the start of each month the
 * CLOSED pre-orders of earlier months are deleted with their prices; open ones
 * stay whatever their age. Orders made from them keep their own note.
 */
import { z } from 'zod'
import { haversineMeters } from '../fleet/domain/gps'
import { enqueue, enqueueRealtime } from '../notify/outbox'
import { ARMENIAN_PHONE, destinationPoint, normaliseArmenianPhone, pickupPoint, skatesCount, triState } from '../orders/domain/order-input'
import { DispatchError } from '../platform/errors'
import { toNullableNumber, toNumber } from '../platform/params'
import type { Sql, SqlDatabase } from '../platform/sql'

export const createPreOrderSchema = z
  .object({
    pickup: pickupPoint,
    /** Required (2026-11-17): a driver cannot price a job without knowing where it goes */
    destination: destinationPoint,
    vehicle: z
      .object({
        make: z.string().trim().max(60).nullable().optional(),
        model: z.string().trim().max(60).nullable().optional(),
        weightKg: z.number().int().min(100).max(60_000).nullable().optional(),
      })
      .default({}),
    requirements: z
      .object({
        wheelsRoll: triState.optional(),
        steeringLocked: triState.optional(),
        gearboxLocked: triState.optional(),
        needsManipulator: triState.optional(),
        needsWheelSkates: triState.optional(),
        wheelSkatesCount: skatesCount.optional(),
      })
      .default({}),
    /** What the drivers read */
    comment: z.string().trim().max(1000).default(''),
    /** Operator only — kept for the conversion, never shown to a driver */
    customerPhone: z.string().transform(normaliseArmenianPhone).pipe(z.string().regex(ARMENIAN_PHONE)).nullable().optional(),
    customerName: z.string().trim().max(120).nullable().optional(),
    internalNote: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()

export type CreatePreOrderInput = z.infer<typeof createPreOrderSchema>

/** The shortest gap between two push rounds of one pre-order (creation counts as the first) */
export const NOTIFY_COOLDOWN_MS = 2 * 60_000

export const bidSchema = z.object({ priceAmd: z.number().int().min(100).max(10_000_000) }).strict()

export interface PreOrderRow {
  id: number
  status: 'OPEN' | 'CLOSED'
  pickupLatitude: number | null
  pickupLongitude: number | null
  pickupAddress: string
  pickupPrecision: 'EXACT' | 'APPROXIMATE' | null
  destinationLatitude: number | null
  destinationLongitude: number | null
  destinationAddress: string | null
  vehicleMake: string | null
  vehicleModel: string | null
  vehicleWeightKg: number | null
  wheelsRoll: boolean | null
  steeringLocked: boolean | null
  gearboxLocked: boolean | null
  needsManipulator: boolean | null
  needsWheelSkates: boolean | null
  wheelSkatesCount: number | null
  comment: string
  customerPhone: string | null
  customerName: string | null
  internalNote: string | null
  closedAt: Date | null
  /** Push rounds sent (1 at creation, +1 per «Կրկին ծանուցել») and drivers reached by the last */
  notifyRounds: number
  notifiedDrivers: number
  notifiedAt: Date | null
  createdAt: Date
}

const COLUMNS = `p."id", p."status", p."pickupLatitude", p."pickupLongitude", p."pickupAddress", p."pickupPrecision",
  p."destinationLatitude", p."destinationLongitude", p."destinationAddress", p."vehicleMake", p."vehicleModel", p."vehicleWeightKg",
  p."wheelsRoll", p."steeringLocked", p."gearboxLocked", p."needsManipulator", p."needsWheelSkates", p."wheelSkatesCount",
  p."comment", p."customerPhone", p."customerName", p."internalNote", p."closedAt", p."notifyRounds", p."notifiedDrivers", p."notifiedAt", p."createdAt"`

const bool = (v: unknown) => (v === null || v === undefined ? null : Boolean(v))
const str = (v: unknown) => (v === null || v === undefined ? null : String(v))
const date = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string))

function mapRow(r: Record<string, unknown>): PreOrderRow {
  return {
    id: toNumber(r.id),
    status: r.status as PreOrderRow['status'],
    pickupLatitude: toNullableNumber(r.pickupLatitude),
    pickupLongitude: toNullableNumber(r.pickupLongitude),
    pickupAddress: String(r.pickupAddress),
    pickupPrecision: r.pickupPrecision === 'EXACT' || r.pickupPrecision === 'APPROXIMATE' ? r.pickupPrecision : null,
    destinationLatitude: toNullableNumber(r.destinationLatitude),
    destinationLongitude: toNullableNumber(r.destinationLongitude),
    destinationAddress: str(r.destinationAddress),
    vehicleMake: str(r.vehicleMake),
    vehicleModel: str(r.vehicleModel),
    vehicleWeightKg: toNullableNumber(r.vehicleWeightKg),
    wheelsRoll: bool(r.wheelsRoll),
    steeringLocked: bool(r.steeringLocked),
    gearboxLocked: bool(r.gearboxLocked),
    needsManipulator: bool(r.needsManipulator),
    needsWheelSkates: bool(r.needsWheelSkates),
    wheelSkatesCount: toNullableNumber(r.wheelSkatesCount),
    comment: String(r.comment ?? ''),
    customerPhone: str(r.customerPhone),
    customerName: str(r.customerName),
    internalNote: str(r.internalNote),
    closedAt: date(r.closedAt),
    notifyRounds: toNumber(r.notifyRounds ?? 0),
    notifiedDrivers: toNumber(r.notifiedDrivers ?? 0),
    notifiedAt: date(r.notifiedAt),
    createdAt: new Date(r.createdAt as string),
  }
}

/** Prices are taken until the operator closes it */
export function isOpen(p: Pick<PreOrderRow, 'status'>): boolean {
  return p.status === 'OPEN'
}

/** The job as a driver sees it — never the customer, never the operator's note */
export function driverPreOrderView(p: PreOrderRow, extra: { myBidAmd: number | null; distanceMeters: number | null; chosen: boolean }) {
  return {
    id: p.id,
    open: isOpen(p),
    createdAt: p.createdAt.toISOString(),
    pickup: { latitude: p.pickupLatitude, longitude: p.pickupLongitude, address: p.pickupAddress, precision: p.pickupPrecision },
    destination:
      p.destinationAddress === null && p.destinationLatitude === null
        ? null
        : { latitude: p.destinationLatitude, longitude: p.destinationLongitude, address: p.destinationAddress ?? '' },
    vehicle: { make: p.vehicleMake, model: p.vehicleModel, weightKg: p.vehicleWeightKg },
    requirements: {
      wheelsRoll: p.wheelsRoll,
      steeringLocked: p.steeringLocked,
      gearboxLocked: p.gearboxLocked,
      needsManipulator: p.needsManipulator,
      needsWheelSkates: p.needsWheelSkates,
      wheelSkatesCount: p.wheelSkatesCount,
    },
    comment: p.comment,
    /** His own price, if he answered */
    myBidAmd: extra.myBidAmd,
    /** Straight line from where his phone last was to the pickup; null without either */
    distanceMeters: extra.distanceMeters,
    /** The operator turned it into an order and offered it to HIM (at least once) */
    chosen: extra.chosen,
  }
}

export function adminPreOrderView(p: PreOrderRow) {
  return {
    ...driverPreOrderView(p, { myBidAmd: null, distanceMeters: null, chosen: false }),
    status: p.status,
    customer: { phone: p.customerPhone, name: p.customerName },
    internalNote: p.internalNote,
    closedAt: p.closedAt?.toISOString() ?? null,
    notify: { rounds: p.notifyRounds, drivers: p.notifiedDrivers, at: p.notifiedAt?.toISOString() ?? null },
  }
}

/**
 * The create-order body «Պատվեր տալ» sends (live-dispatch.service.ts
 * `convertPreOrder`): the job as the pre-order describes it, the chosen
 * driver's price as a FIXED price, the customer's phone, and a note saying
 * where it came from. Pure — the order schema then validates it like any
 * operator-created order.
 */
export function orderBodyFromPreOrder(p: PreOrderRow, chosen: { priceAmd: number; customerPhone: string }): Record<string, unknown> {
  return {
    customerPhone: chosen.customerPhone,
    customerName: p.customerName,
    pickup: {
      latitude: p.pickupLatitude,
      longitude: p.pickupLongitude,
      address: p.pickupAddress,
      precision: p.pickupLatitude === null ? null : (p.pickupPrecision ?? 'APPROXIMATE'),
    },
    destination:
      p.destinationAddress === null && p.destinationLatitude === null
        ? null
        : { latitude: p.destinationLatitude, longitude: p.destinationLongitude, address: p.destinationAddress ?? 'Հասցեն նշված չէ' },
    vehicle: { make: p.vehicleMake, model: p.vehicleModel, weightKg: p.vehicleWeightKg },
    problemDescription: p.comment,
    requirements: {
      wheelsRoll: p.wheelsRoll,
      steeringLocked: p.steeringLocked,
      gearboxLocked: p.gearboxLocked,
      needsManipulator: p.needsManipulator,
      needsWheelSkates: p.needsWheelSkates,
      wheelSkatesCount: p.wheelSkatesCount,
    },
    pricing: { mode: 'FIXED', quotedPriceAmd: chosen.priceAmd },
    // Capped at 2 000 like the order's own note: the prefix must not push a long operator note over it
    internalNote: [`Նախապատվեր #${p.id}-ից (վարորդի գինը՝ ${chosen.priceAmd} ֏)`, p.internalNote].filter(Boolean).join('\n').slice(0, 2000),
  }
}

export class PreOrdersRepository {
  constructor(private readonly db: SqlDatabase) {}

  async get(db: Sql, id: number, forUpdate = false): Promise<PreOrderRow | null> {
    const rows = await db.query<Record<string, unknown>>(`SELECT ${COLUMNS} FROM "PreOrder" p WHERE p."id" = $1::int${forUpdate ? ' FOR UPDATE' : ''}`, [id])
    return rows[0] ? mapRow(rows[0]) : null
  }

  /** Creates it, picks the recipients by what their trucks can do, queues their pushes. Returns the row and how many were told. */
  async create(tx: Sql, input: CreatePreOrderInput, adminUserId: number): Promise<{ preOrder: PreOrderRow; recipients: number }> {
    const r = input.requirements
    const [row] = await tx.query<Record<string, unknown>>(
      `INSERT INTO "PreOrder" AS p ("createdByUserId", "pickupLatitude", "pickupLongitude", "pickupAddress", "pickupPrecision",
          "destinationLatitude", "destinationLongitude", "destinationAddress", "vehicleMake", "vehicleModel", "vehicleWeightKg",
          "wheelsRoll", "steeringLocked", "gearboxLocked", "needsManipulator", "needsWheelSkates", "wheelSkatesCount",
          "comment", "customerPhone", "customerName", "internalNote")
       VALUES ($1::int, $2::numeric, $3::numeric, $4, $5, $6::numeric, $7::numeric, $8, $9, $10, $11::int,
          $12::boolean, $13::boolean, $14::boolean, $15::boolean, $16::boolean, $17::smallint,
          $18, $19, $20, $21)
       RETURNING ${COLUMNS}`,
      [
        adminUserId,
        input.pickup.latitude,
        input.pickup.longitude,
        input.pickup.address,
        input.pickup.latitude === null ? null : (input.pickup.precision ?? null),
        input.destination.latitude,
        input.destination.longitude,
        input.destination.address,
        input.vehicle.make ?? null,
        input.vehicle.model ?? null,
        input.vehicle.weightKg ?? null,
        r.wheelsRoll ?? null,
        r.steeringLocked ?? null,
        r.gearboxLocked ?? null,
        r.needsManipulator ?? null,
        r.needsWheelSkates ?? null,
        r.needsWheelSkates === true ? (r.wheelSkatesCount ?? null) : null,
        input.comment,
        input.customerPhone ?? null,
        input.customerName ?? null,
        input.internalNote ?? null,
      ],
    )
    const preOrder = mapRow(row)
    const recipients = await this.notifyAll(tx, preOrder.id)
    await enqueueRealtime(tx, `pre-order:created:${preOrder.id}`, ['admin'], 'pre-order.changed', { preOrderId: preOrder.id })
    return { preOrder: { ...preOrder, notifyRounds: 1, notifiedDrivers: recipients, notifiedAt: new Date() }, recipients }
  }

  /**
   * One push round to EVERY active driver (2026-11-18) — at creation and on
   * each «Կրկին ծանուցել». Each round has its own dedupe keys, so a second
   * round is really sent; the push itself is skipped once the pre-order is
   * closed (PushService.sendPreOrderPush). Returns how many drivers it reached.
   */
  private async notifyAll(tx: Sql, id: number): Promise<number> {
    const [{ round }] = await tx.query<{ round: number }>(
      `UPDATE "PreOrder" SET "notifyRounds" = "notifyRounds" + 1, "notifiedAt" = now() WHERE "id" = $1::int RETURNING "notifyRounds" AS "round"`,
      [id],
    )
    const drivers = await tx.query<{ id: number }>(`SELECT "id" FROM "FleetDriver" WHERE "status" = 'ACTIVE' ORDER BY "id"`)
    for (const { id: driverId } of drivers) {
      await enqueue(tx, {
        topic: 'push.preOrder',
        payload: { preOrderId: id, driverId: toNumber(driverId), reminder: Number(round) > 1 },
        dedupeKey: `pre-order:${id}:r${round}:${driverId}`,
        maxAttempts: 3,
      })
    }
    await tx.query(`UPDATE "PreOrder" SET "notifiedDrivers" = $2::int WHERE "id" = $1::int`, [id, drivers.length])
    return drivers.length
  }

  /**
   * «Կրկին ծանուցել»: push every active driver again — only while it is open,
   * and not twice within NOTIFY_COOLDOWN_MS (2026-11-18): every round wakes
   * every driver's phone, so two presses in a row must not mean two pushes.
   */
  async notify(tx: Sql, id: number, now = new Date()): Promise<{ notified: number; round: number }> {
    const preOrder = await this.get(tx, id, true)
    if (!preOrder) throw new DispatchError('PRE_ORDER_NOT_FOUND')
    if (!isOpen(preOrder)) throw new DispatchError('PRE_ORDER_CLOSED')
    const since = preOrder.notifiedAt ? now.getTime() - preOrder.notifiedAt.getTime() : Infinity
    if (since < NOTIFY_COOLDOWN_MS) {
      throw new DispatchError('PRE_ORDER_NOTIFY_TOO_SOON', { retryAfterSeconds: Math.ceil((NOTIFY_COOLDOWN_MS - since) / 1000) })
    }
    const notified = await this.notifyAll(tx, id)
    await enqueueRealtime(tx, `pre-order:notified:${id}:${preOrder.notifyRounds + 1}`, ['admin'], 'pre-order.changed', { preOrderId: id })
    return { notified, round: preOrder.notifyRounds + 1 }
  }

  /**
   * The monthly clean slate: CLOSED pre-orders closed before the current
   * month began (Yerevan time) are deleted with their prices and conversion
   * links; open ones stay. Idempotent — the worker calls it every hour.
   */
  async purgePastMonths(): Promise<number> {
    const rows = await this.db.query(
      `DELETE FROM "PreOrder"
        WHERE "status" = 'CLOSED'
          AND "closedAt" < (date_trunc('month', now() AT TIME ZONE 'Asia/Yerevan') AT TIME ZONE 'Asia/Yerevan')
        RETURNING 1`,
    )
    return rows.length
  }

  async list(status: 'OPEN' | 'CLOSED', limit = 100) {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT ${COLUMNS},
              (SELECT count(*) FROM "PreOrderBid" b WHERE b."preOrderId" = p."id") AS "bids",
              (SELECT min(b."priceAmd") FROM "PreOrderBid" b WHERE b."preOrderId" = p."id") AS "bestAmd",
              (SELECT count(*) FROM "PreOrderConversion" c WHERE c."preOrderId" = p."id") AS "orders"
         FROM "PreOrder" p WHERE p."status" = $1 ORDER BY p."createdAt" DESC LIMIT $2::int`,
      [status, Math.min(Math.max(limit, 1), 200)],
    )
    return rows.map((r) => ({
      ...adminPreOrderView(mapRow(r)),
      recipients: toNumber(r.notifiedDrivers ?? 0),
      bids: toNumber(r.bids),
      bestAmd: toNullableNumber(r.bestAmd),
      /** Orders made from it so far */
      orders: toNumber(r.orders),
    }))
  }

  /** The operator's view: the job, how many were told, and every price — cheapest first */
  async detail(id: number) {
    const preOrder = await this.get(this.db, id)
    if (!preOrder) throw new DispatchError('PRE_ORDER_NOT_FOUND')
    const bids = await this.db.query<Record<string, unknown>>(
      `SELECT b."driverId", b."priceAmd", b."createdAt", b."updatedAt", t."driverName", t."phone", t."vehicleType", t."capacityTons",
              lc."latitude" AS "lat", lc."longitude" AS "lng",
              (SELECT round(avg(r."score")::numeric, 1) FROM "OrderRating" r WHERE r."driverId" = b."driverId") AS "ratingAvg",
              (SELECT count(*) FROM "OrderRating" r WHERE r."driverId" = b."driverId") AS "ratingCount",
              EXISTS (SELECT 1 FROM "OrderAssignment" a WHERE a."driverId" = b."driverId" AND a."endedAt" IS NULL) AS "busy"
         FROM "PreOrderBid" b
         JOIN "FleetDriverProfile" t ON t."id" = b."driverId"
         LEFT JOIN "DriverLocationCurrent" lc ON lc."driverId" = b."driverId"
        WHERE b."preOrderId" = $1::int
        ORDER BY b."priceAmd", b."updatedAt"`,
      [id],
    )
    const orders = await this.db.query<Record<string, unknown>>(
      `SELECT c."orderId", c."driverId", c."priceAmd", c."createdAt", o."number", o."status", t."driverName",
              (SELECT f."status" FROM "OrderOffer" f WHERE f."orderId" = c."orderId" AND f."driverId" = c."driverId" ORDER BY f."createdAt" DESC LIMIT 1) AS "offerStatus"
         FROM "PreOrderConversion" c
         JOIN "DispatchOrder" o ON o."id" = c."orderId"
         LEFT JOIN "FleetDriverProfile" t ON t."id" = c."driverId"
        WHERE c."preOrderId" = $1::int
        ORDER BY c."createdAt"`,
      [id],
    )
    return {
      preOrder: adminPreOrderView(preOrder),
      /** Drivers reached by the last push round */
      recipients: preOrder.notifiedDrivers,
      /** Every order made from it, oldest first, with how the offer to that driver went */
      orders: orders.map((o) => ({
        orderId: toNumber(o.orderId),
        number: String(o.number),
        status: String(o.status),
        driverId: toNumber(o.driverId),
        driverName: str(o.driverName),
        priceAmd: toNumber(o.priceAmd),
        offerStatus: str(o.offerStatus),
        createdAt: new Date(o.createdAt as string).toISOString(),
      })),
      bids: bids.map((b) => ({
        driverId: toNumber(b.driverId),
        name: str(b.driverName),
        phone: str(b.phone),
        vehicleType: String(b.vehicleType),
        capacityTons: toNullableNumber(b.capacityTons),
        priceAmd: toNumber(b.priceAmd),
        updatedAt: new Date(b.updatedAt as string).toISOString(),
        rating: toNumber(b.ratingCount ?? 0) > 0 ? { average: toNumber(b.ratingAvg), count: toNumber(b.ratingCount) } : null,
        /** On another order right now */
        busy: Boolean(b.busy),
        distanceMeters: distance(preOrder, toNullableNumber(b.lat), toNullableNumber(b.lng)),
      })),
    }
  }

  async close(id: number, adminUserId: number): Promise<{ closed: boolean }> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.query(
        `UPDATE "PreOrder" SET "status" = 'CLOSED', "closedAt" = now(), "closedByUserId" = $2::int WHERE "id" = $1::int AND "status" = 'OPEN' RETURNING 1`,
        [id, adminUserId],
      )
      if (rows.length > 0) await enqueueRealtime(tx, `pre-order:closed:${id}`, ['admin'], 'pre-order.changed', { preOrderId: id })
      return { closed: rows.length > 0 }
    })
  }

  /** An order made from it for this driver — recorded, the pre-order stays as it is (open until the operator closes it) */
  async recordConversion(tx: Sql, input: { preOrderId: number; orderId: number; driverId: number; priceAmd: number; adminUserId: number }): Promise<void> {
    await tx.query(
      `INSERT INTO "PreOrderConversion" ("orderId", "preOrderId", "driverId", "priceAmd", "createdByUserId") VALUES ($1::int, $2::int, $3::int, $4::int, $5::int)`,
      [input.orderId, input.preOrderId, input.driverId, input.priceAmd, input.adminUserId],
    )
    await enqueueRealtime(tx, `pre-order:converted:${input.orderId}`, ['admin'], 'pre-order.changed', { preOrderId: input.preOrderId })
  }

  // ─── Driver side ──────────────────────────────────────────────────────────

  /**
   * What a driver sees: EVERY open pre-order (2026-11-18 — all of them, no
   * filter; even a hundred), plus the closed ones he priced in the last 2 days.
   */
  async forDriver(driverId: number) {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT ${COLUMNS}, b."priceAmd" AS "myBid", lc."latitude" AS "lat", lc."longitude" AS "lng",
              EXISTS (SELECT 1 FROM "PreOrderConversion" c WHERE c."preOrderId" = p."id" AND c."driverId" = $1::int) AS "chosen"
         FROM "PreOrder" p
         LEFT JOIN "PreOrderBid" b ON b."preOrderId" = p."id" AND b."driverId" = $1::int
         LEFT JOIN "DriverLocationCurrent" lc ON lc."driverId" = $1::int
        WHERE p."status" = 'OPEN'
           OR (b."priceAmd" IS NOT NULL AND p."createdAt" > now() - interval '2 days')
        ORDER BY (p."status" = 'OPEN') DESC, p."createdAt" DESC
        LIMIT 500`,
      [driverId],
    )
    return rows.map((r) => {
      const p = mapRow(r)
      return driverPreOrderView(p, {
        myBidAmd: toNullableNumber(r.myBid),
        distanceMeters: distance(p, toNullableNumber(r.lat), toNullableNumber(r.lng)),
        chosen: Boolean(r.chosen),
      })
    })
  }

  /** His price — new or changed, while it is open. Any active driver (the guard) may answer. */
  async bid(driverId: number, id: number, priceAmd: number): Promise<{ priceAmd: number }> {
    return this.db.transaction(async (tx) => {
      const preOrder = await this.get(tx, id, true)
      if (!preOrder) throw new DispatchError('PRE_ORDER_NOT_FOUND')
      if (!isOpen(preOrder)) throw new DispatchError('PRE_ORDER_CLOSED')
      await tx.query(
        `INSERT INTO "PreOrderBid" ("preOrderId", "driverId", "priceAmd") VALUES ($1::int, $2::int, $3::int)
         ON CONFLICT ("preOrderId", "driverId") DO UPDATE SET "priceAmd" = EXCLUDED."priceAmd", "updatedAt" = now()`,
        [id, driverId, priceAmd],
      )
      await enqueueRealtime(tx, `pre-order:bid:${id}:${driverId}:${Date.now()}`, ['admin'], 'pre-order.bid', { preOrderId: id })
      return { priceAmd }
    })
  }

  async withdraw(driverId: number, id: number): Promise<{ withdrawn: boolean }> {
    return this.db.transaction(async (tx) => {
      const preOrder = await this.get(tx, id, true)
      if (!preOrder) throw new DispatchError('PRE_ORDER_NOT_FOUND')
      if (!isOpen(preOrder)) throw new DispatchError('PRE_ORDER_CLOSED')
      const rows = await tx.query(`DELETE FROM "PreOrderBid" WHERE "preOrderId" = $1::int AND "driverId" = $2::int RETURNING 1`, [id, driverId])
      if (rows.length > 0) await enqueueRealtime(tx, `pre-order:withdraw:${id}:${driverId}:${Date.now()}`, ['admin'], 'pre-order.bid', { preOrderId: id })
      return { withdrawn: rows.length > 0 }
    })
  }

  /** One driver's bid (for the conversion) */
  async bidOf(db: Sql, id: number, driverId: number): Promise<number | null> {
    const rows = await db.query<{ priceAmd: number }>(`SELECT "priceAmd" FROM "PreOrderBid" WHERE "preOrderId" = $1::int AND "driverId" = $2::int`, [id, driverId])
    return rows[0] ? toNumber(rows[0].priceAmd) : null
  }
}

function distance(p: PreOrderRow, lat: number | null, lng: number | null): number | null {
  if (lat === null || lng === null || p.pickupLatitude === null || p.pickupLongitude === null) return null
  return Math.round(haversineMeters(lat, lng, p.pickupLatitude, p.pickupLongitude))
}
