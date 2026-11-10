/** Mirrors docs/live-dispatch/openapi.json (driver-app tag). */
export type OrderStatus =
  | 'DRAFT' | 'SEARCHING' | 'PRICE_CONFIRMATION_PENDING' | 'ASSIGNED' | 'EN_ROUTE_TO_PICKUP'
  | 'ARRIVED_AT_PICKUP' | 'TRANSPORTING' | 'COMPLETED' | 'NEEDS_ATTENTION' | 'CANCELLED'
export type ProgressAction = 'EN_ROUTE' | 'ARRIVED' | 'START_TRANSPORT' | 'COMPLETE'

export interface Availability {
  eligible: boolean
  reasons: string[]
  admin: 'APPROVED' | 'SUSPENDED' | 'INACTIVE'
  preference: 'ONLINE' | 'OFFLINE'
  connection: 'FRESH' | 'STALE' | 'NEVER'
  gps: 'FRESH' | 'STALE' | 'INACCURATE' | 'SUSPICIOUS' | 'NONE'
  occupancy: 'FREE' | 'RESERVED' | 'ON_ORDER' | 'EXTERNAL_BUSY'
  gpsAgeSeconds: number | null
  heartbeatAgeSeconds: number | null
  /** Not eligible by GPS alone, but connected with a base location: may still get an order via the base fallback */
  baseFallback?: boolean
}

export interface Point { latitude: number; longitude: number; address: string }
/** Pickup coordinates may be unknown (2026-11: only the address is mandatory) — no navigation then */
export interface PickupPoint { latitude: number | null; longitude: number | null; address: string }

export interface OfferOrderView {
  number: string
  pickup: PickupPoint
  destination: Point | null
  vehicle: { make: string | null; model: string | null; plate: string | null; weightKg: number | null }
  problemDescription: string
  requirements: {
    wheelsRoll: boolean | null
    steeringLocked: boolean | null
    gearboxLocked: boolean | null
    needsManipulator: boolean | null
    /** The operator asked for wheel skates; the count (1–4) is for the driver to bring */
    needsWheelSkates?: boolean | null
    wheelSkatesCount?: number | null
  }
  price: { mode: 'FIXED' | 'NEGOTIATION_REQUIRED'; quotedAmd: number | null; agreedAmd: number | null; confirmed: boolean }
  pickupToDestination: { meters: number | null; seconds: number | null; manual: boolean } | null
}

export interface CurrentOffer {
  offerId: string
  expiresAt: string
  serverTime: string
  manual: boolean
  toPickup: { roadMeters: number | null; etaSeconds: number | null; approximate: true; straightLineMeters: number | null }
  order: OfferOrderView
}

export interface ActiveOrder extends OfferOrderView {
  id: number
  status: OrderStatus
  version: number
  attentionKind: string | null
  /** Customer contact — only once the order is this driver's (never on an offer) */
  customer: { phone: string; name: string | null }
  allowedActions: ProgressAction[]
  /** Server-decided: may ask to cancel (only before setting off) */
  canCancel: boolean
  /** Server-decided: may record the price agreed with the customer by phone */
  canSetPrice: boolean
}

export interface TrackingPolicyDto {
  mode: 'OFF' | 'IDLE_STATIONARY' | 'IDLE_MOVING' | 'ACTIVE_ORDER'
  locationIntervalSeconds: number | null
  heartbeatIntervalSeconds: number | null
  distanceFilterMeters: number | null
  jitterSeconds: number
}

export interface Snapshot {
  serverTime: string
  driver: { name: string; kind: 'SITE_LINKED' | 'APP_ONLY' }
  availability: Availability
  switches: { wantsOnline: boolean; externalBusy: boolean }
  trackingConsentVersion: number | null
  currentOffer: CurrentOffer | null
  activeOrder: ActiveOrder | null
  tracking: TrackingPolicyDto
}

export interface HistoryItem {
  id: number
  number: string
  status: OrderStatus
  pickupAddress: string
  destinationAddress: string | null
  price: { mode: string; amountAmd: number | null }
  completedAt: string | null
  cancelledAt: string | null
  createdAt: string
}
