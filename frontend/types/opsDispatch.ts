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

export type CancelReason = 'DRIVER_CANNOT_PERFORM' | 'CUSTOMER_DECLINED' | 'WRONG_DATA' | 'PRICE_NOT_AGREED' | 'TECHNICAL_PROBLEM' | 'OTHER'
export type PaymentStatus = 'UNKNOWN' | 'UNPAID' | 'PAID'
export type PricingMode = 'FIXED' | 'NEGOTIATION_REQUIRED'
export type ProgressAction = 'EN_ROUTE' | 'ARRIVED' | 'START_TRANSPORT' | 'COMPLETE'

export interface OpsPoint {
  latitude: number
  longitude: number
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
  pickup: OpsPoint
  destination: OpsPoint | null
  vehicle: { make: string | null; model: string | null; plate: string | null; weightKg: number | null }
  problemDescription: string
  requirements: {
    wheelsRoll: boolean | null
    steeringLocked: boolean | null
    gearboxLocked: boolean | null
    needsManipulator: boolean | null
    overridden: boolean
    overrideNote: string | null
  }
  price: { mode: PricingMode; currency: 'AMD'; quotedAmd: number | null; agreedAmd: number | null; confirmed: boolean; confirmedAt: string | null }
  payment: { status: PaymentStatus; updatedAt: string | null }
  assignedTowTruckId: number | null
  pickupToDestination: { meters: number | null; seconds: number | null; computedAt: string | null; provider: string | null; manual: boolean } | null
  cancel: { reason: CancelReason; comment: string | null } | null
  internalNote: string | null
  timestamps: Record<string, string | null>
}

export interface OpsOffer {
  id: string
  towTruckId: number
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
  towTruckId: number
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
  towTruckId: number
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
