/** Live dispatch console types — mirror docs/live-dispatch/openapi.json */

export type OrderStatus =
  | 'DRAFT'
  | 'SEARCHING'
  | 'PRICE_CONFIRMATION_PENDING'
  | 'ASSIGNED'
  | 'EN_ROUTE_TO_PICKUP'
  | 'ARRIVED_AT_PICKUP'
  | 'TRANSPORTING'
  | 'COMPLETED'
  | 'NEEDS_ATTENTION'
  | 'CANCELLED'

export type AttentionKind =
  | 'SEARCH_EXHAUSTED'
  | 'SEARCH_TIMEOUT'
  | 'MANUAL_OFFER_FAILED'
  | 'DRIVER_CANCEL_REQUEST'
  | 'DRIVER_PROBLEM'
  | 'OPERATOR_FLAG'

/** NOT_SPECIFIED only ever comes from a driver who picked no reason in time — an operator cannot choose it */
export type CancelReason = 'DRIVER_CANNOT_PERFORM' | 'CUSTOMER_DECLINED' | 'WRONG_DATA' | 'PRICE_NOT_AGREED' | 'TECHNICAL_PROBLEM' | 'OTHER' | 'NOT_SPECIFIED'
export type PaymentStatus = 'UNKNOWN' | 'UNPAID' | 'PAID'
export type PricingMode = 'FIXED' | 'NEGOTIATION_REQUIRED'
export type ProgressAction = 'EN_ROUTE' | 'ARRIVED' | 'START_TRANSPORT' | 'COMPLETE'

export interface OpsPoint {
  latitude: number
  longitude: number
  address: string
}

/** Pickup only (product decision, 2026-11): coordinates may be unknown — a "phone it in" order, manual-assign only. */
export interface OpsPickupPoint {
  latitude: number | null
  longitude: number | null
  address: string
}

export interface OpsOrder {
  id: number
  number: string
  source: 'ADMIN' | 'WEBSITE'
  status: OrderStatus
  attentionKind: AttentionKind | null
  statusBeforeAttention: OrderStatus | null
  version: number
  termsVersion: number
  customer: { phone: string; name: string | null }
  pickup: OpsPickupPoint
  destination: OpsPoint | null
  vehicle: { make: string | null; model: string | null; plate: string | null; weightKg: number | null }
  problemDescription: string
  requirements: {
    wheelsRoll: boolean | null
    steeringLocked: boolean | null
    gearboxLocked: boolean | null
    needsManipulator: boolean | null
    needsWheelSkates?: boolean | null
    wheelSkatesCount?: number | null
    overridden: boolean
    overrideNote: string | null
  }
  price: { mode: PricingMode; currency: 'AMD'; quotedAmd: number | null; agreedAmd: number | null; confirmed: boolean; confirmedAt: string | null }
  payment: { status: PaymentStatus; updatedAt: string | null }
  assignedDriverId: number | null
  pickupToDestination: { meters: number | null; seconds: number | null; computedAt: string | null; provider: string | null; manual: boolean } | null
  cancel: { reason: CancelReason; comment: string | null } | null
  internalNote: string | null
  timestamps: Record<string, string | null>
}

export interface OpsOffer {
  id: string
  driverId: number
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'REVOKED'
  manual: boolean
  termsVersion: number
  createdAt: string
  expiresAt: string
  respondedAt: string | null
  etaSeconds: number | null
  roadMeters: number | null
  closeReason: string | null
}

export interface OpsCandidate {
  driverId: number
  driverName: string
  rank: number
  straightLineMeters: number
  roadMeters: number | null
  etaSeconds: number | null
  routeOk: boolean
  routeError: string | null
  routedAt: string | null
  status: 'QUEUED' | 'OFFERED' | 'SKIPPED'
  skipReason: string | null
  /** BASE = no usable GPS; distance measured from the driver's base (dispatch fallback) */
  locationSource?: 'GPS' | 'BASE'
}

export interface OpsTimelineEvent {
  id: number
  type: string
  actorType: 'ADMIN' | 'DRIVER' | 'SYSTEM'
  actorId: number | null
  data: Record<string, unknown>
  createdAt: string
}

export interface OpsOrderDetail {
  order: OpsOrder
  offers: OpsOffer[]
  candidates: OpsCandidate[]
  timeline: OpsTimelineEvent[]
}

export interface OpsAvailability {
  eligible: boolean
  reasons: string[]
  admin: 'APPROVED' | 'SUSPENDED' | 'INACTIVE'
  preference: 'ONLINE' | 'OFFLINE'
  connection: 'FRESH' | 'STALE' | 'NEVER'
  gps: 'FRESH' | 'STALE' | 'INACCURATE' | 'SUSPICIOUS' | 'NONE'
  occupancy: 'FREE' | 'RESERVED' | 'ON_ORDER' | 'EXTERNAL_BUSY'
  gpsAgeSeconds: number | null
  heartbeatAgeSeconds: number | null
}

export interface OpsMapDriver {
  /** FleetDriver.id — the app driver, NOT the website TowTruck id */
  driverId: number
  kind: FleetDriverKind
  /** Website profile, only for SITE_LINKED */
  towTruckId: number | null
  slug: string | null
  driverName: string
  phone: string
  vehicleType: string
  position: { latitude: number; longitude: number; accuracyM: number | null; measuredAt: string | null } | null
  availability: OpsAvailability
  activeOrderId: number | null
  manualOverridable: boolean
}

export interface OpsAlert {
  id: number
  orderId: number
  kind: string
  data: Record<string, unknown>
  createdAt: string
}

export interface OpsApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

/**
 * App drivers (`/ops/dispatch/fleet`, ADMIN only). Mirrors `FleetDriverView`
 * in backend/src/live-dispatch/fleet/fleet-access.ts.
 *
 * SITE_LINKED — on the website; an admin granted app access; signs in with the
 * website password. APP_ONLY — registered in the app, never on the website.
 */
export type FleetDriverKind = 'SITE_LINKED' | 'APP_ONLY'
/** DELETED: the driver deleted his own app account; personal data cleared */
export type FleetDriverStatus = 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED' | 'DELETED'

export interface FleetDriver {
  id: number
  kind: FleetDriverKind
  status: FleetDriverStatus
  towTruckId: number | null
  slug: string | null
  driverName: string
  phone: string
  vehicleType: string
  capacityTons: number | null
  maxLoadTons: number | null
  manipulator: boolean
  wheelSkates: boolean
  vehicleDescription: string | null
  /** May receive orders: app access ACTIVE. The website status plays no part */
  isActive: boolean
  /** Shown on the website right now — informational, no effect on the app */
  siteListed: boolean
  statusReason: string | null
  statusChangedAt: string
  createdAt: string
}

export interface FleetSiteCandidate {
  towTruckId: number
  driverName: string
  phone: string
  slug: string
  isActive: boolean
  vehicleType: string
  driverId: number | null
  accessStatus: FleetDriverStatus | null
}
