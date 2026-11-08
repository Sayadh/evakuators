/**
 * Order lifecycle writes. Every method:
 *
 * 1. locks the order row (`lockOrder`),
 * 2. asks the pure state machine whether the change is allowed (`planTransition`),
 * 3. writes the change, its audit event and its notifications (outbox) in the
 *    SAME transaction.
 *
 * Methods take a `tx` so the service layer can wrap them in an idempotent
 * transaction (`runIdempotent`) — the key, the change and the stored response
 * commit together.
 */
import { enqueue } from '../notify/outbox'
import { raiseAlert, recordEvent, type ActorRef } from '../platform/audit'
import { DispatchError } from '../platform/errors'
import { Params, toDate, toNumber } from '../platform/params'
import type { DispatchSettings } from '../platform/settings'
import type { Sql, SqlDatabase } from '../platform/sql'
import {
  assertDispatchable,
  bumpOrder,
  createAttempt,
  notifyOrderChanged,
  revokePendingOffer,
} from '../dispatching/offers.repository'
import { planTransition, type AttentionKind, type OrderAction, type OrderStatus } from './domain/order-state'
import { COLUMN_CASTS, updateColumns, type CreateOrderInput, type UpdateOrderInput } from './domain/order-input'
import { lockOrder, mapOrder, ORDER_COLUMNS, readOrder, snapshotOf, type OrderRow } from './order-row'

const PROGRESS_COLUMN: Partial<Record<OrderAction, string>> = {
  EN_ROUTE: 'enRouteAt',
  ARRIVED: 'arrivedAt',
  START_TRANSPORT: 'transportStartedAt',
  COMPLETE: 'completedAt',
}

function checkVersion(order: OrderRow, expectedVersion: number | undefined): void {
  if (expectedVersion !== undefined && order.version !== expectedVersion) {
    throw new DispatchError('VERSION_CONFLICT', { currentVersion: order.version })
  }
}

async function endActiveAssignment(tx: Sql, order: OrderRow, reason: string, adminUserId: number | null): Promise<number | null> {
  if (order.activeAssignmentId === null) return null
  const rows = await tx.query<{ towTruckId: number }>(
    `UPDATE "OrderAssignment" SET "endedAt" = now(), "endReason" = $2, "endedByUserId" = $3::int
      WHERE "id" = $1::int AND "endedAt" IS NULL RETURNING "towTruckId"`,
    [order.activeAssignmentId, reason, adminUserId],
  )
  const towTruckId = rows[0] ? toNumber(rows[0].towTruckId) : null
  if (towTruckId !== null) {
    // The driver is free again: they re-enter the fair queue from now.
    await tx.query(
      `UPDATE "DriverPresence" SET "availableSince" = CASE WHEN "wantsOnline" AND NOT "externalBusy" THEN now() ELSE NULL END,
              "updatedAt" = now() WHERE "towTruckId" = $1::int`,
      [towTruckId],
    )
  }
  return towTruckId
}

async function resolveOpenRequest(tx: Sql, orderId: number, adminUserId: number | null, resolution: string): Promise<void> {
  await tx.query(
    `UPDATE "OrderDriverRequest" SET "status" = 'RESOLVED', "resolvedAt" = now(), "resolvedByUserId" = $2::int, "resolution" = $3
      WHERE "orderId" = $1::int AND "status" = 'OPEN'`,
    [orderId, adminUserId, resolution],
  )
}

async function pushToDriver(tx: Sql, order: OrderRow, towTruckId: number, kind: string): Promise<void> {
  const [{ version }] = await tx.query<{ version: number }>(`SELECT "version" FROM "DispatchOrder" WHERE "id" = $1::int`, [order.id])
  await enqueue(tx, {
    topic: 'push.order',
    payload: { orderId: order.id, towTruckId, kind },
    dedupeKey: `push-order:${order.id}:v${version}:${kind}`,
  })
}

export class OrdersRepository {
  constructor(private readonly db: SqlDatabase) {}

  // ─── Create / edit ────────────────────────────────────────────────────────

  async create(tx: Sql, input: CreateOrderInput, adminUserId: number): Promise<OrderRow> {
    const p = new Params()
    const rows = await tx.query<Record<string, unknown>>(
      `INSERT INTO "DispatchOrder" AS o ("source", "createdByUserId", "customerPhone", "customerName",
          "pickupLatitude", "pickupLongitude", "pickupAddress",
          "destinationLatitude", "destinationLongitude", "destinationAddress",
          "vehicleMake", "vehicleModel", "vehiclePlate", "vehicleWeightKg", "problemDescription",
          "wheelsRoll", "steeringLocked", "gearboxLocked", "needsManipulator",
          "pricingMode", "quotedPriceAmd", "internalNote")
       VALUES ('ADMIN', ${p.add(adminUserId)}::int, ${p.add(input.customerPhone)}, ${p.add(input.customerName ?? null)},
          ${p.add(input.pickup.latitude)}::numeric, ${p.add(input.pickup.longitude)}::numeric, ${p.add(input.pickup.address)},
          ${p.add(input.destination?.latitude ?? null)}::numeric, ${p.add(input.destination?.longitude ?? null)}::numeric,
          ${p.add(input.destination?.address ?? null)},
          ${p.add(input.vehicle.make ?? null)}, ${p.add(input.vehicle.model ?? null)}, ${p.add(input.vehicle.plate ?? null)},
          ${p.add(input.vehicle.weightKg ?? null)}::int, ${p.add(input.problemDescription)},
          ${p.add(input.requirements.wheelsRoll ?? null)}::boolean, ${p.add(input.requirements.steeringLocked ?? null)}::boolean,
          ${p.add(input.requirements.gearboxLocked ?? null)}::boolean, ${p.add(input.requirements.needsManipulator ?? null)}::boolean,
          ${p.add(input.pricing.mode)}::"OrderPricingMode", ${p.add(input.pricing.quotedPriceAmd ?? null)}::int,
          ${p.add(input.internalNote ?? null)})
       RETURNING ${ORDER_COLUMNS}`,
      p.values,
    )
    const order = mapOrder(rows[0])
    await recordEvent(tx, order.id, 'ORDER_CREATED', { type: 'ADMIN', id: adminUserId }, {
      pricingMode: order.pricingMode,
      quotedPriceAmd: order.quotedPriceAmd,
    })
    await notifyOrderChanged(tx, order, 'ORDER_CREATED')
    return order
  }

  /**
   * Edits. A material change while SEARCHING revokes the pending offer (the
   * driver sees it disappear) and re-queues that driver so the NEW terms can
   * be offered — never silently accepted under the old ones. After
   * assignment, material changes are allowed only for price (audited) and
   * destination; pickup/requirements changes need a release + new search.
   */
  async update(tx: Sql, orderId: number, input: UpdateOrderInput, adminUserId: number): Promise<OrderRow> {
    const order = await lockOrder(tx, orderId)
    checkVersion(order, input.expectedVersion)
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      const onlyNote = Object.keys(input).every((key) => key === 'expectedVersion' || key === 'internalNote')
      if (!onlyNote) throw new DispatchError('INVALID_TRANSITION', { action: 'EDIT', status: order.status })
    }
    const { columns, material } = updateColumns(input)
    const assigned = order.activeAssignmentId !== null
    if (assigned) {
      const forbidden = material.filter((c) => !['quotedPriceAmd', 'pricingMode', 'destinationLatitude', 'destinationLongitude', 'destinationAddress'].includes(c))
      if (forbidden.length > 0) throw new DispatchError('INVALID_TRANSITION', { action: 'EDIT_ASSIGNED', fields: forbidden })
      if (columns.pricingMode !== undefined && columns.pricingMode !== order.pricingMode) {
        throw new DispatchError('INVALID_TRANSITION', { action: 'EDIT_ASSIGNED', fields: ['pricingMode'] })
      }
    }
    if (Object.keys(columns).length === 0) return order

    const changedMaterial = material.filter((column) => {
      const before = (order as unknown as Record<string, unknown>)[column]
      return String(before ?? '') !== String(columns[column] ?? '')
    })

    const p = new Params()
    const sets = Object.entries(columns).map(([column, value]) => `"${column}" = ${p.add(value as never)}::${COLUMN_CASTS[column]}`)
    if (changedMaterial.length > 0) sets.push('"termsVersion" = "termsVersion" + 1')
    if (changedMaterial.some((c) => c.startsWith('destination') || c.startsWith('pickup'))) {
      // Road figures describe the old points; never show them for the new ones.
      sets.push('"routeMeters" = NULL', '"routeSeconds" = NULL', '"routeComputedAt" = NULL', '"routeProvider" = NULL', '"routeManual" = false')
    }
    await bumpOrder(tx, orderId, sets, p)

    const admin: ActorRef = { type: 'ADMIN', id: adminUserId }
    await recordEvent(tx, orderId, 'ORDER_EDITED', admin, {
      fields: Object.keys(columns),
      material: changedMaterial,
      before: Object.fromEntries(Object.keys(columns).map((c) => [c, (order as unknown as Record<string, unknown>)[c] ?? null])),
      after: columns,
    })
    if (changedMaterial.some((c) => c === 'quotedPriceAmd' || c === 'pricingMode')) {
      await recordEvent(tx, orderId, 'PRICE_CHANGED', admin, {
        before: { mode: order.pricingMode, quotedPriceAmd: order.quotedPriceAmd },
        after: { mode: columns.pricingMode ?? order.pricingMode, quotedPriceAmd: columns.quotedPriceAmd ?? order.quotedPriceAmd },
      })
    }

    if (changedMaterial.length > 0 && order.status === 'SEARCHING') {
      const revoked = await revokePendingOffer(tx, orderId, 'TERMS_CHANGED', admin)
      if (revoked) {
        // Give the same driver a chance at the new terms.
        await tx.query(
          `UPDATE "DispatchCandidate" SET "status" = 'QUEUED' WHERE "attemptId" = $1::int AND "towTruckId" = $2::int`,
          [revoked.attemptId, revoked.towTruckId],
        )
        await tx.query(`UPDATE "DispatchAttempt" SET "offersMade" = GREATEST(0, "offersMade" - 1) WHERE "id" = $1::int`, [revoked.attemptId])
        await enqueue(tx, {
          topic: 'dispatch.advance',
          payload: { orderId, attemptId: revoked.attemptId },
          dedupeKey: `advance:${revoked.attemptId}:terms:${order.termsVersion + 1}`,
        })
      }
    }
    const updated = await lockOrder(tx, orderId)
    if (assigned && changedMaterial.length > 0 && updated.assignedTowTruckId) {
      await pushToDriver(tx, updated, updated.assignedTowTruckId, 'TERMS_CHANGED')
    }
    await notifyOrderChanged(tx, updated, 'ORDER_EDITED')
    return updated
  }

  async overrideRequirements(tx: Sql, orderId: number, note: string, expectedVersion: number, adminUserId: number): Promise<OrderRow> {
    if (note.trim().length < 5) throw new DispatchError('VALIDATION_FAILED', { field: 'note' })
    const order = await lockOrder(tx, orderId)
    checkVersion(order, expectedVersion)
    if (order.status !== 'DRAFT' && order.status !== 'NEEDS_ATTENTION') {
      throw new DispatchError('INVALID_TRANSITION', { action: 'OVERRIDE_REQUIREMENTS', status: order.status })
    }
    const p = new Params()
    await bumpOrder(
      tx,
      orderId,
      [`"requirementsOverrideAt" = now()`, `"requirementsOverrideBy" = ${p.add(adminUserId)}::int`, `"requirementsOverrideNote" = ${p.add(note.trim())}`, `"termsVersion" = "termsVersion" + 1`],
      p,
    )
    await recordEvent(tx, orderId, 'REQUIREMENTS_OVERRIDDEN', { type: 'ADMIN', id: adminUserId }, {
      note: note.trim(),
      unknownAtOverride: {
        vehicleWeightKg: order.vehicleWeightKg === null,
        wheelsRoll: order.wheelsRoll === null,
        steeringLocked: order.steeringLocked === null,
        gearboxLocked: order.gearboxLocked === null,
        needsManipulator: order.needsManipulator === null,
      },
    })
    return lockOrder(tx, orderId)
  }

  // ─── Dispatch control ─────────────────────────────────────────────────────

  async startDispatch(tx: Sql, orderId: number, expectedVersion: number, adminUserId: number, settings: DispatchSettings): Promise<OrderRow> {
    const order = await lockOrder(tx, orderId)
    checkVersion(order, expectedVersion)
    planTransition('START_DISPATCH', snapshotOf(order), 'ADMIN')
    assertDispatchable(order)
    const attemptId = await createAttempt(tx, orderId, 'AUTO', adminUserId, settings)
    const p = new Params()
    await bumpOrder(
      tx,
      orderId,
      [`"status" = 'SEARCHING'`, `"attentionKind" = NULL`, `"statusBeforeAttention" = NULL`, `"dispatchStartedAt" = COALESCE("dispatchStartedAt", now())`],
      p,
    )
    await recordEvent(tx, orderId, 'DISPATCH_STARTED', { type: 'ADMIN', id: adminUserId }, { attemptId })
    await enqueue(tx, { topic: 'dispatch.advance', payload: { orderId, attemptId }, dedupeKey: `advance:${attemptId}:start` })
    const updated = await lockOrder(tx, orderId)
    await notifyOrderChanged(tx, updated, 'DISPATCH_STARTED')
    return updated
  }

  async stopDispatch(tx: Sql, orderId: number, expectedVersion: number, adminUserId: number): Promise<OrderRow> {
    const order = await lockOrder(tx, orderId)
    checkVersion(order, expectedVersion)
    const planned = planTransition('STOP_DISPATCH', snapshotOf(order), 'ADMIN')
    const admin: ActorRef = { type: 'ADMIN', id: adminUserId }
    await revokePendingOffer(tx, orderId, 'DISPATCH_STOPPED', admin)
    await tx.query(`UPDATE "DispatchAttempt" SET "endedAt" = now(), "endReason" = 'STOPPED' WHERE "orderId" = $1::int AND "endedAt" IS NULL`, [orderId])
    const p = new Params()
    await bumpOrder(tx, orderId, [`"status" = ${p.add(planned.to)}::"DispatchOrderStatus"`], p)
    await recordEvent(tx, orderId, 'DISPATCH_STOPPED', admin)
    const updated = await lockOrder(tx, orderId)
    await notifyOrderChanged(tx, updated, 'DISPATCH_STOPPED')
    return updated
  }

  // ─── Progress (driver, or an operator on the driver's behalf) ─────────────

  async progress(
    tx: Sql,
    orderId: number,
    action: 'EN_ROUTE' | 'ARRIVED' | 'START_TRANSPORT' | 'COMPLETE',
    actor: ActorRef,
    expectedVersion?: number,
  ): Promise<OrderRow> {
    const order = await lockOrder(tx, orderId)
    if (actor.type === 'DRIVER' && order.assignedTowTruckId !== actor.id) {
      // Not this driver's order: indistinguishable from "does not exist".
      throw new DispatchError('ORDER_NOT_FOUND')
    }
    checkVersion(order, expectedVersion)
    const planned = planTransition(action, snapshotOf(order), actor.type)
    const p = new Params()
    const sets = [`"status" = ${p.add(planned.to)}::"DispatchOrderStatus"`, `"${PROGRESS_COLUMN[action]}" = now()`]
    if (action === 'COMPLETE') sets.push('"activeAssignmentId" = NULL')
    const towTruckId = order.assignedTowTruckId
    if (action === 'COMPLETE') await endActiveAssignment(tx, order, 'COMPLETED', actor.type === 'ADMIN' ? actor.id : null)
    await bumpOrder(tx, orderId, sets, p)
    await recordEvent(tx, orderId, `PROGRESS_${action}`, actor, { from: order.status, to: planned.to })
    const updated = await lockOrder(tx, orderId)
    await notifyOrderChanged(tx, updated, `PROGRESS_${action}`, towTruckId ? [towTruckId] : [])
    if (actor.type === 'ADMIN' && towTruckId) await pushToDriver(tx, updated, towTruckId, `PROGRESS_${action}`)
    return updated
  }

  // ─── Price & payment ──────────────────────────────────────────────────────

  async confirmPrice(tx: Sql, orderId: number, agreedPriceAmd: number, expectedVersion: number, adminUserId: number): Promise<OrderRow> {
    if (!Number.isSafeInteger(agreedPriceAmd) || agreedPriceAmd < 0 || agreedPriceAmd > 10_000_000) {
      throw new DispatchError('VALIDATION_FAILED', { field: 'agreedPriceAmd' })
    }
    const order = await lockOrder(tx, orderId)
    checkVersion(order, expectedVersion)
    const planned = planTransition('CONFIRM_PRICE', snapshotOf(order), 'ADMIN')
    const p = new Params()
    await bumpOrder(
      tx,
      orderId,
      [
        `"status" = ${p.add(planned.to)}::"DispatchOrderStatus"`,
        `"agreedPriceAmd" = ${p.add(agreedPriceAmd)}::int`,
        `"priceConfirmedAt" = now()`,
        `"priceConfirmedBy" = ${p.add(adminUserId)}::int`,
      ],
      p,
    )
    await recordEvent(tx, orderId, 'PRICE_CONFIRMED', { type: 'ADMIN', id: adminUserId }, { agreedPriceAmd, quotedPriceAmd: order.quotedPriceAmd })
    const updated = await lockOrder(tx, orderId)
    if (updated.assignedTowTruckId) await pushToDriver(tx, updated, updated.assignedTowTruckId, 'PRICE_CONFIRMED')
    await notifyOrderChanged(tx, updated, 'PRICE_CONFIRMED')
    return updated
  }

  /** Payment is its own fact. Completing an order never sets it. */
  async setPaymentStatus(tx: Sql, orderId: number, status: 'UNKNOWN' | 'UNPAID' | 'PAID', expectedVersion: number, adminUserId: number): Promise<OrderRow> {
    const order = await lockOrder(tx, orderId)
    checkVersion(order, expectedVersion)
    if (order.status === 'DRAFT' && status === 'PAID') throw new DispatchError('INVALID_TRANSITION', { action: 'SET_PAYMENT', status: order.status })
    const p = new Params()
    await bumpOrder(
      tx,
      orderId,
      [`"paymentStatus" = ${p.add(status)}::"OrderPaymentStatus"`, `"paymentUpdatedAt" = now()`, `"paymentUpdatedBy" = ${p.add(adminUserId)}::int`],
      p,
    )
    await recordEvent(tx, orderId, 'PAYMENT_STATUS_SET', { type: 'ADMIN', id: adminUserId }, { from: order.paymentStatus, to: status })
    const updated = await lockOrder(tx, orderId)
    await notifyOrderChanged(tx, updated, 'PAYMENT_STATUS_SET')
    return updated
  }

  // ─── Cancellation, problems, attention ────────────────────────────────────

  async cancel(tx: Sql, orderId: number, input: { reason: string; comment?: string | null; expectedVersion: number }, adminUserId: number): Promise<OrderRow> {
    const order = await lockOrder(tx, orderId)
    checkVersion(order, input.expectedVersion)
    planTransition('CANCEL', snapshotOf(order), 'ADMIN')
    const admin: ActorRef = { type: 'ADMIN', id: adminUserId }
    await revokePendingOffer(tx, orderId, 'ORDER_CANCELLED', admin)
    await tx.query(`UPDATE "DispatchAttempt" SET "endedAt" = now(), "endReason" = 'CANCELLED' WHERE "orderId" = $1::int AND "endedAt" IS NULL`, [orderId])
    const towTruckId = await endActiveAssignment(tx, order, 'ORDER_CANCELLED', adminUserId)
    await resolveOpenRequest(tx, orderId, adminUserId, 'ORDER_CANCELLED')
    const p = new Params()
    await bumpOrder(
      tx,
      orderId,
      [
        `"status" = 'CANCELLED'`,
        `"attentionKind" = NULL`,
        `"statusBeforeAttention" = NULL`,
        `"activeAssignmentId" = NULL`,
        `"cancelReason" = ${p.add(input.reason)}::"OrderCancelReason"`,
        `"cancelComment" = ${p.add(input.comment ?? null)}`,
        `"cancelledAt" = now()`,
      ],
      p,
    )
    await recordEvent(tx, orderId, 'ORDER_CANCELLED', admin, { reason: input.reason, comment: input.comment ?? null, releasedTowTruckId: towTruckId })
    const updated = await lockOrder(tx, orderId)
    if (towTruckId) await pushToDriver(tx, updated, towTruckId, 'ORDER_CANCELLED')
    await notifyOrderChanged(tx, updated, 'ORDER_CANCELLED', towTruckId ? [towTruckId] : [])
    return updated
  }

  /**
   * The driver asks out (CANCEL) or reports a PROBLEM. A cancel request puts
   * the order in NEEDS_ATTENTION and KEEPS the assignment: nothing is
   * re-dispatched, no second truck is sent, until an operator decides.
   */
  async driverRequest(
    tx: Sql,
    orderId: number,
    towTruckId: number,
    input: { kind: 'CANCEL' | 'PROBLEM'; reason: string; comment?: string | null },
  ): Promise<OrderRow> {
    const order = await lockOrder(tx, orderId)
    if (order.assignedTowTruckId !== towTruckId) throw new DispatchError('ORDER_NOT_FOUND')
    const driver: ActorRef = { type: 'DRIVER', id: towTruckId }
    // Decide BEFORE writing anything: a refused request leaves no trace.
    const planned = input.kind === 'CANCEL' ? planTransition('DRIVER_CANCEL_REQUEST', snapshotOf(order), 'DRIVER') : null
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') throw new DispatchError('INVALID_TRANSITION', { action: 'DRIVER_REQUEST', status: order.status })
    const open = await tx.query(`SELECT 1 FROM "OrderDriverRequest" WHERE "orderId" = $1::int AND "status" = 'OPEN'`, [orderId])
    if (open.length > 0) throw new DispatchError('REQUEST_ALREADY_OPEN')

    const [request] = await tx.query<{ id: number }>(
      `INSERT INTO "OrderDriverRequest" ("orderId", "towTruckId", "kind", "reason", "comment")
       VALUES ($1::int, $2::int, $3, $4::"OrderCancelReason", $5) RETURNING "id"`,
      [orderId, towTruckId, input.kind, input.reason, input.comment ?? null],
    )
    if (planned) {
      const p = new Params()
      await bumpOrder(
        tx,
        orderId,
        [
          `"status" = 'NEEDS_ATTENTION'`,
          `"attentionKind" = 'DRIVER_CANCEL_REQUEST'`,
          `"statusBeforeAttention" = ${p.add(planned.statusBeforeAttention)}::"DispatchOrderStatus"`,
        ],
        p,
      )
    } else {
      const p = new Params()
      await bumpOrder(tx, orderId, [], p)
    }
    await recordEvent(tx, orderId, input.kind === 'CANCEL' ? 'DRIVER_CANCEL_REQUESTED' : 'DRIVER_PROBLEM_REPORTED', driver, {
      requestId: toNumber(request.id),
      reason: input.reason,
      comment: input.comment ?? null,
    })
    await raiseAlert(tx, orderId, input.kind === 'CANCEL' ? 'DRIVER_CANCEL_REQUEST' : 'DRIVER_PROBLEM', `driver-request:${request.id}`, {
      reason: input.reason,
    })
    const updated = await lockOrder(tx, orderId)
    await notifyOrderChanged(tx, updated, `DRIVER_${input.kind}`)
    return updated
  }

  async flagAttention(tx: Sql, orderId: number, kind: AttentionKind, note: string, expectedVersion: number, adminUserId: number): Promise<OrderRow> {
    const order = await lockOrder(tx, orderId)
    checkVersion(order, expectedVersion)
    const planned = planTransition('FLAG_ATTENTION', snapshotOf(order), 'ADMIN', { attentionKind: kind })
    const p = new Params()
    await bumpOrder(
      tx,
      orderId,
      [
        `"status" = 'NEEDS_ATTENTION'`,
        `"attentionKind" = ${p.add(planned.attentionKind)}::"OrderAttentionKind"`,
        `"statusBeforeAttention" = ${p.add(planned.statusBeforeAttention)}::"DispatchOrderStatus"`,
      ],
      p,
    )
    await recordEvent(tx, orderId, 'ATTENTION_FLAGGED', { type: 'ADMIN', id: adminUserId }, { kind, note })
    const updated = await lockOrder(tx, orderId)
    await notifyOrderChanged(tx, updated, 'ATTENTION_FLAGGED')
    return updated
  }

  /** The driver stays: back to where the order was, the open request is closed */
  async resumeFromAttention(tx: Sql, orderId: number, note: string, expectedVersion: number, adminUserId: number): Promise<OrderRow> {
    const order = await lockOrder(tx, orderId)
    checkVersion(order, expectedVersion)
    const planned = planTransition('RESUME_FROM_ATTENTION', snapshotOf(order), 'ADMIN')
    await resolveOpenRequest(tx, orderId, adminUserId, 'RESUMED')
    const p = new Params()
    await bumpOrder(
      tx,
      orderId,
      [`"status" = ${p.add(planned.to)}::"DispatchOrderStatus"`, `"attentionKind" = NULL`, `"statusBeforeAttention" = NULL`],
      p,
    )
    await recordEvent(tx, orderId, 'ATTENTION_RESOLVED_RESUMED', { type: 'ADMIN', id: adminUserId }, { note, status: planned.to })
    const updated = await lockOrder(tx, orderId)
    if (updated.assignedTowTruckId) await pushToDriver(tx, updated, updated.assignedTowTruckId, 'RESUMED')
    await notifyOrderChanged(tx, updated, 'ATTENTION_RESOLVED')
    return updated
  }

  /**
   * The one safe way to take an order away from a driver: the operator
   * confirms the previous assignment is over, and — in the SAME transaction —
   * optionally starts a new search. There is no path that sends a second
   * truck while the first is still assigned.
   */
  async releaseAssignment(
    tx: Sql,
    orderId: number,
    input: { confirm: true; reason: string; restartSearch: boolean; expectedVersion: number },
    adminUserId: number,
    settings: DispatchSettings,
  ): Promise<OrderRow> {
    if (input.confirm !== true) throw new DispatchError('VALIDATION_FAILED', { field: 'confirm' })
    const order = await lockOrder(tx, orderId)
    checkVersion(order, input.expectedVersion)
    const planned = planTransition('RELEASE_ASSIGNMENT', snapshotOf(order), 'ADMIN', { restartSearch: input.restartSearch })
    if (input.restartSearch) assertDispatchable(order)
    const admin: ActorRef = { type: 'ADMIN', id: adminUserId }
    const releasedTowTruckId = await endActiveAssignment(tx, order, `RELEASED: ${input.reason}`, adminUserId)
    await resolveOpenRequest(tx, orderId, adminUserId, 'ASSIGNMENT_RELEASED')
    const p = new Params()
    const sets = [
      `"status" = ${p.add(planned.to)}::"DispatchOrderStatus"`,
      `"attentionKind" = NULL`,
      `"statusBeforeAttention" = NULL`,
      `"activeAssignmentId" = NULL`,
      `"assignedAt" = NULL`,
      `"enRouteAt" = NULL`,
      `"arrivedAt" = NULL`,
      // A negotiated price was agreed with the PREVIOUS driver.
      `"priceConfirmedAt" = CASE WHEN "pricingMode" = 'NEGOTIATION_REQUIRED' THEN NULL ELSE "priceConfirmedAt" END`,
      `"agreedPriceAmd" = CASE WHEN "pricingMode" = 'NEGOTIATION_REQUIRED' THEN NULL ELSE "agreedPriceAmd" END`,
      `"termsVersion" = "termsVersion" + 1`,
    ]
    await bumpOrder(tx, orderId, sets, p)
    await recordEvent(tx, orderId, 'ASSIGNMENT_RELEASED', admin, {
      releasedTowTruckId,
      reason: input.reason,
      restartSearch: input.restartSearch,
    })
    if (input.restartSearch) {
      const attemptId = await createAttempt(tx, orderId, 'AUTO', adminUserId, settings)
      if (releasedTowTruckId !== null) {
        // The driver who just left this job is not offered it again in the
        // new search (they are free for OTHER orders immediately).
        await tx.query(
          `INSERT INTO "DispatchCandidate" ("attemptId", "towTruckId", "batch", "rank", "straightLineMeters", "status", "skipReason")
           VALUES ($1::int, $2::int, -1, -1, 0, 'SKIPPED', 'RELEASED_FROM_THIS_ORDER')`,
          [attemptId, releasedTowTruckId],
        )
      }
      await recordEvent(tx, orderId, 'DISPATCH_STARTED', admin, { attemptId, afterRelease: true })
      await enqueue(tx, { topic: 'dispatch.advance', payload: { orderId, attemptId }, dedupeKey: `advance:${attemptId}:start` })
    }
    const updated = await lockOrder(tx, orderId)
    if (releasedTowTruckId) await pushToDriver(tx, updated, releasedTowTruckId, 'ASSIGNMENT_RELEASED')
    await notifyOrderChanged(tx, updated, 'ASSIGNMENT_RELEASED', releasedTowTruckId ? [releasedTowTruckId] : [])
    return updated
  }

  /** Pickup → destination road figures (computed, or typed by an operator — marked as such) */
  async setRoute(
    orderId: number,
    route: { meters: number; seconds: number | null; provider: string | null; manual: boolean; computedAt: Date; termsVersion: number },
    actor: ActorRef,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const order = await lockOrder(tx, orderId)
      // Computed for an older pickup/destination? Drop it.
      if (order.termsVersion !== route.termsVersion || order.destinationLatitude === null) return false
      await tx.query(
        `UPDATE "DispatchOrder" SET "routeMeters" = $2::int, "routeSeconds" = $3::int, "routeProvider" = $4,
                "routeManual" = $5::boolean, "routeComputedAt" = $6::timestamptz, "updatedAt" = now()
          WHERE "id" = $1::int`,
        [orderId, Math.round(route.meters), route.seconds === null ? null : Math.round(route.seconds), route.provider, route.manual, route.computedAt],
      )
      await recordEvent(tx, orderId, route.manual ? 'ROUTE_SET_MANUALLY' : 'ROUTE_COMPUTED', actor, {
        meters: route.meters,
        seconds: route.seconds,
        provider: route.provider,
      })
      return true
    })
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  async get(orderId: number): Promise<OrderRow | null> {
    return readOrder(this.db, orderId)
  }

  async list(filter: {
    statuses?: OrderStatus[]
    search?: string
    limit: number
    cursor?: { createdAt: Date; id: number } | null
  }): Promise<OrderRow[]> {
    const p = new Params()
    const where: string[] = ['true']
    if (filter.statuses && filter.statuses.length > 0) {
      where.push(`o."status"::text = ANY(${p.add(`{${filter.statuses.join(',')}}`)}::text[])`)
    }
    if (filter.search && filter.search.trim().length >= 2) {
      const term = `%${filter.search.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`
      where.push(`(o."number" ILIKE ${p.add(term)} OR o."customerPhone" LIKE ${p.add(term)} OR o."pickupAddress" ILIKE ${p.add(term)})`)
    }
    if (filter.cursor) {
      where.push(`(o."createdAt", o."id") < (${p.add(filter.cursor.createdAt)}::timestamptz, ${p.add(filter.cursor.id)}::int)`)
    }
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT ${ORDER_COLUMNS} FROM "DispatchOrder" o WHERE ${where.join(' AND ')}
        ORDER BY o."createdAt" DESC, o."id" DESC LIMIT ${p.add(Math.min(Math.max(filter.limit, 1), 100))}::int`,
      p.values,
    )
    return rows.map(mapOrder)
  }

  async timeline(orderId: number): Promise<{ id: number; type: string; actorType: string; actorId: number | null; data: unknown; createdAt: string }[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT "id", "type", "actorType", "actorId", "data", "createdAt" FROM "OrderEvent" WHERE "orderId" = $1::int ORDER BY "id"`,
      [orderId],
    )
    return rows.map((row) => ({
      id: toNumber(row.id),
      type: String(row.type),
      actorType: String(row.actorType),
      actorId: row.actorId === null ? null : toNumber(row.actorId),
      data: row.data,
      createdAt: toDate(row.createdAt).toISOString(),
    }))
  }

  async activeOrderFor(towTruckId: number): Promise<OrderRow | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT ${ORDER_COLUMNS} FROM "DispatchOrder" o
         JOIN "OrderAssignment" a ON a."id" = o."activeAssignmentId"
        WHERE a."towTruckId" = $1::int AND a."endedAt" IS NULL`,
      [towTruckId],
    )
    return rows[0] ? mapOrder(rows[0]) : null
  }

  async historyFor(towTruckId: number, limit: number, before: Date | null): Promise<OrderRow[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT DISTINCT ON (o."id") ${ORDER_COLUMNS}, a."startedAt" AS "assignedStartedAt"
         FROM "OrderAssignment" a JOIN "DispatchOrder" o ON o."id" = a."orderId"
        WHERE a."towTruckId" = $1::int AND ($2::timestamptz IS NULL OR a."startedAt" < $2::timestamptz)
        ORDER BY o."id" DESC, a."startedAt" DESC
        LIMIT $3::int`,
      [towTruckId, before, Math.min(Math.max(limit, 1), 50)],
    )
    return rows.map(mapOrder)
  }

  async openAlerts(limit: number): Promise<{ id: number; orderId: number; kind: string; data: unknown; createdAt: string }[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT "id", "orderId", "kind", "data", "createdAt" FROM "OrderAlert" WHERE "acknowledgedAt" IS NULL ORDER BY "createdAt" LIMIT $1::int`,
      [Math.min(limit, 200)],
    )
    return rows.map((row) => ({
      id: toNumber(row.id),
      orderId: toNumber(row.orderId),
      kind: String(row.kind),
      data: row.data,
      createdAt: toDate(row.createdAt).toISOString(),
    }))
  }

  async acknowledgeAlert(alertId: number, adminUserId: number): Promise<void> {
    await this.db.query(
      `UPDATE "OrderAlert" SET "acknowledgedAt" = now(), "acknowledgedBy" = $2::int WHERE "id" = $1::int AND "acknowledgedAt" IS NULL`,
      [alertId, adminUserId],
    )
  }
}
