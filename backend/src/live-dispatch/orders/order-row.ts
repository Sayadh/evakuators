/**
 * The order row as the repositories read it, and the two views built from it.
 *
 * Who sees what is decided HERE, in one place:
 * - `adminOrderView` — operators see everything, including internal notes.
 * - `driverOrderView` — the ASSIGNED driver sees the customer's phone and name;
 *   an offered driver (`driverOfferView`) sees only what is needed to decide:
 *   addresses, distances, vehicle, problem, price/negotiation — never the
 *   customer's contact, never internal notes.
 */
import { toDate, toNullableDate, toNullableNumber, toNumber } from '../platform/params'
import type { Sql } from '../platform/sql'
import { DispatchError } from '../platform/errors'
import {
  allowedDriverActions,
  type AttentionKind,
  type OrderStateSnapshot,
  type OrderStatus,
} from './domain/order-state'
import type { OrderRequirements } from './domain/requirements'

export interface OrderRow {
  id: number
  number: string
  source: 'ADMIN' | 'WEBSITE'
  createdByUserId: number | null
  customerPhone: string
  customerName: string | null
  pickupLatitude: number
  pickupLongitude: number
  pickupAddress: string
  destinationLatitude: number | null
  destinationLongitude: number | null
  destinationAddress: string | null
  vehicleMake: string | null
  vehicleModel: string | null
  vehiclePlate: string | null
  vehicleWeightKg: number | null
  problemDescription: string
  wheelsRoll: boolean | null
  steeringLocked: boolean | null
  gearboxLocked: boolean | null
  needsManipulator: boolean | null
  requirementsOverrideAt: Date | null
  requirementsOverrideBy: number | null
  requirementsOverrideNote: string | null
  pricingMode: 'FIXED' | 'NEGOTIATION_REQUIRED'
  currency: 'AMD'
  quotedPriceAmd: number | null
  agreedPriceAmd: number | null
  priceConfirmedAt: Date | null
  priceConfirmedBy: number | null
  paymentStatus: 'UNKNOWN' | 'UNPAID' | 'PAID'
  paymentUpdatedAt: Date | null
  status: OrderStatus
  attentionKind: AttentionKind | null
  statusBeforeAttention: OrderStatus | null
  termsVersion: number
  version: number
  activeAssignmentId: number | null
  assignedTowTruckId: number | null
  routeMeters: number | null
  routeSeconds: number | null
  routeComputedAt: Date | null
  routeProvider: string | null
  routeManual: boolean
  cancelReason: string | null
  cancelComment: string | null
  internalNote: string | null
  createdAt: Date
  updatedAt: Date
  dispatchStartedAt: Date | null
  assignedAt: Date | null
  enRouteAt: Date | null
  arrivedAt: Date | null
  transportStartedAt: Date | null
  completedAt: Date | null
  cancelledAt: Date | null
}

export const ORDER_COLUMNS = `
  o."id", o."number", o."source", o."createdByUserId", o."customerPhone", o."customerName",
  o."pickupLatitude", o."pickupLongitude", o."pickupAddress",
  o."destinationLatitude", o."destinationLongitude", o."destinationAddress",
  o."vehicleMake", o."vehicleModel", o."vehiclePlate", o."vehicleWeightKg", o."problemDescription",
  o."wheelsRoll", o."steeringLocked", o."gearboxLocked", o."needsManipulator",
  o."requirementsOverrideAt", o."requirementsOverrideBy", o."requirementsOverrideNote",
  o."pricingMode", o."currency", o."quotedPriceAmd", o."agreedPriceAmd", o."priceConfirmedAt", o."priceConfirmedBy",
  o."paymentStatus", o."paymentUpdatedAt",
  o."status", o."attentionKind", o."statusBeforeAttention", o."termsVersion", o."version", o."activeAssignmentId",
  (SELECT a."towTruckId" FROM "OrderAssignment" a WHERE a."id" = o."activeAssignmentId") AS "assignedTowTruckId",
  o."routeMeters", o."routeSeconds", o."routeComputedAt", o."routeProvider", o."routeManual",
  o."cancelReason", o."cancelComment", o."internalNote",
  o."createdAt", o."updatedAt", o."dispatchStartedAt", o."assignedAt", o."enRouteAt", o."arrivedAt",
  o."transportStartedAt", o."completedAt", o."cancelledAt"`

export function mapOrder(row: Record<string, unknown>): OrderRow {
  const b = (v: unknown) => (v === null || v === undefined ? null : Boolean(v))
  const s = (v: unknown) => (v === null || v === undefined ? null : String(v))
  return {
    id: toNumber(row.id),
    number: String(row.number),
    source: row.source as OrderRow['source'],
    createdByUserId: toNullableNumber(row.createdByUserId),
    customerPhone: String(row.customerPhone),
    customerName: s(row.customerName),
    pickupLatitude: toNumber(row.pickupLatitude),
    pickupLongitude: toNumber(row.pickupLongitude),
    pickupAddress: String(row.pickupAddress),
    destinationLatitude: toNullableNumber(row.destinationLatitude),
    destinationLongitude: toNullableNumber(row.destinationLongitude),
    destinationAddress: s(row.destinationAddress),
    vehicleMake: s(row.vehicleMake),
    vehicleModel: s(row.vehicleModel),
    vehiclePlate: s(row.vehiclePlate),
    vehicleWeightKg: toNullableNumber(row.vehicleWeightKg),
    problemDescription: String(row.problemDescription ?? ''),
    wheelsRoll: b(row.wheelsRoll),
    steeringLocked: b(row.steeringLocked),
    gearboxLocked: b(row.gearboxLocked),
    needsManipulator: b(row.needsManipulator),
    requirementsOverrideAt: toNullableDate(row.requirementsOverrideAt),
    requirementsOverrideBy: toNullableNumber(row.requirementsOverrideBy),
    requirementsOverrideNote: s(row.requirementsOverrideNote),
    pricingMode: row.pricingMode as OrderRow['pricingMode'],
    currency: 'AMD',
    quotedPriceAmd: toNullableNumber(row.quotedPriceAmd),
    agreedPriceAmd: toNullableNumber(row.agreedPriceAmd),
    priceConfirmedAt: toNullableDate(row.priceConfirmedAt),
    priceConfirmedBy: toNullableNumber(row.priceConfirmedBy),
    paymentStatus: row.paymentStatus as OrderRow['paymentStatus'],
    paymentUpdatedAt: toNullableDate(row.paymentUpdatedAt),
    status: row.status as OrderStatus,
    attentionKind: (row.attentionKind ?? null) as AttentionKind | null,
    statusBeforeAttention: (row.statusBeforeAttention ?? null) as OrderStatus | null,
    termsVersion: toNumber(row.termsVersion),
    version: toNumber(row.version),
    activeAssignmentId: toNullableNumber(row.activeAssignmentId),
    assignedTowTruckId: toNullableNumber(row.assignedTowTruckId),
    routeMeters: toNullableNumber(row.routeMeters),
    routeSeconds: toNullableNumber(row.routeSeconds),
    routeComputedAt: toNullableDate(row.routeComputedAt),
    routeProvider: s(row.routeProvider),
    routeManual: Boolean(row.routeManual),
    cancelReason: s(row.cancelReason),
    cancelComment: s(row.cancelComment),
    internalNote: s(row.internalNote),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
    dispatchStartedAt: toNullableDate(row.dispatchStartedAt),
    assignedAt: toNullableDate(row.assignedAt),
    enRouteAt: toNullableDate(row.enRouteAt),
    arrivedAt: toNullableDate(row.arrivedAt),
    transportStartedAt: toNullableDate(row.transportStartedAt),
    completedAt: toNullableDate(row.completedAt),
    cancelledAt: toNullableDate(row.cancelledAt),
  }
}

/** Reads AND row-locks the order. Every state change starts here, so all of them serialise on this row. */
export async function lockOrder(tx: Sql, orderId: number): Promise<OrderRow> {
  const rows = await tx.query<Record<string, unknown>>(
    `SELECT ${ORDER_COLUMNS} FROM "DispatchOrder" o WHERE o."id" = $1::int FOR UPDATE OF o`,
    [orderId],
  )
  if (!rows[0]) throw new DispatchError('ORDER_NOT_FOUND')
  return mapOrder(rows[0])
}

export async function readOrder(db: Sql, orderId: number): Promise<OrderRow | null> {
  const rows = await db.query<Record<string, unknown>>(`SELECT ${ORDER_COLUMNS} FROM "DispatchOrder" o WHERE o."id" = $1::int`, [orderId])
  return rows[0] ? mapOrder(rows[0]) : null
}

export function snapshotOf(order: OrderRow): OrderStateSnapshot {
  return {
    status: order.status,
    attentionKind: order.attentionKind,
    statusBeforeAttention: order.statusBeforeAttention,
    hasActiveAssignment: order.activeAssignmentId !== null,
    pricingMode: order.pricingMode,
    priceConfirmed: order.priceConfirmedAt !== null,
  }
}

export function requirementsOf(order: OrderRow): OrderRequirements {
  return {
    vehicleWeightKg: order.vehicleWeightKg,
    wheelsRoll: order.wheelsRoll,
    steeringLocked: order.steeringLocked,
    gearboxLocked: order.gearboxLocked,
    needsManipulator: order.needsManipulator,
    overridden: order.requirementsOverrideAt !== null,
  }
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)

export function priceView(order: OrderRow) {
  return {
    mode: order.pricingMode,
    currency: order.currency,
    quotedAmd: order.quotedPriceAmd,
    agreedAmd: order.agreedPriceAmd,
    confirmed: order.pricingMode === 'FIXED' || order.priceConfirmedAt !== null,
    confirmedAt: iso(order.priceConfirmedAt),
  }
}

function vehicleView(order: OrderRow) {
  return {
    make: order.vehicleMake,
    model: order.vehicleModel,
    plate: order.vehiclePlate,
    weightKg: order.vehicleWeightKg,
  }
}

function requirementsView(order: OrderRow) {
  return {
    wheelsRoll: order.wheelsRoll,
    steeringLocked: order.steeringLocked,
    gearboxLocked: order.gearboxLocked,
    needsManipulator: order.needsManipulator,
    overridden: order.requirementsOverrideAt !== null,
    overrideNote: order.requirementsOverrideNote,
  }
}

function routeView(order: OrderRow) {
  if (order.destinationLatitude === null) return null
  return {
    meters: order.routeMeters,
    seconds: order.routeSeconds,
    computedAt: iso(order.routeComputedAt),
    provider: order.routeProvider,
    manual: order.routeManual,
  }
}

export function adminOrderView(order: OrderRow) {
  return {
    id: order.id,
    number: order.number,
    source: order.source,
    status: order.status,
    attentionKind: order.attentionKind,
    statusBeforeAttention: order.statusBeforeAttention,
    version: order.version,
    termsVersion: order.termsVersion,
    customer: { phone: order.customerPhone, name: order.customerName },
    pickup: { latitude: order.pickupLatitude, longitude: order.pickupLongitude, address: order.pickupAddress },
    destination:
      order.destinationLatitude === null
        ? null
        : { latitude: order.destinationLatitude, longitude: order.destinationLongitude, address: order.destinationAddress },
    vehicle: vehicleView(order),
    problemDescription: order.problemDescription,
    requirements: requirementsView(order),
    price: priceView(order),
    payment: { status: order.paymentStatus, updatedAt: iso(order.paymentUpdatedAt) },
    assignedTowTruckId: order.assignedTowTruckId,
    pickupToDestination: routeView(order),
    cancel: order.cancelReason ? { reason: order.cancelReason, comment: order.cancelComment } : null,
    internalNote: order.internalNote,
    timestamps: {
      createdAt: iso(order.createdAt),
      updatedAt: iso(order.updatedAt),
      dispatchStartedAt: iso(order.dispatchStartedAt),
      assignedAt: iso(order.assignedAt),
      enRouteAt: iso(order.enRouteAt),
      arrivedAt: iso(order.arrivedAt),
      transportStartedAt: iso(order.transportStartedAt),
      completedAt: iso(order.completedAt),
      cancelledAt: iso(order.cancelledAt),
    },
  }
}

/** What an OFFERED (not yet assigned) driver may see */
export function driverOfferOrderView(order: OrderRow) {
  return {
    number: order.number,
    pickup: { latitude: order.pickupLatitude, longitude: order.pickupLongitude, address: order.pickupAddress },
    destination:
      order.destinationLatitude === null
        ? null
        : { latitude: order.destinationLatitude, longitude: order.destinationLongitude, address: order.destinationAddress },
    vehicle: vehicleView(order),
    problemDescription: order.problemDescription,
    requirements: requirementsView(order),
    price: priceView(order),
    pickupToDestination: routeView(order),
  }
}

/** What the ASSIGNED driver sees: the offer view plus customer contact and allowed actions */
export function driverActiveOrderView(order: OrderRow) {
  return {
    id: order.id,
    ...driverOfferOrderView(order),
    status: order.status,
    version: order.version,
    attentionKind: order.attentionKind,
    customer: { phone: order.customerPhone, name: order.customerName },
    allowedActions: allowedDriverActions(snapshotOf(order)),
    timestamps: {
      assignedAt: iso(order.assignedAt),
      enRouteAt: iso(order.enRouteAt),
      arrivedAt: iso(order.arrivedAt),
      transportStartedAt: iso(order.transportStartedAt),
    },
  }
}
