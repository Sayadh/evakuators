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
  /** A description alone is possible (2026-11): coordinates may be null — no navigation then */
  destination: PickupPoint | null
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
  /** Driver wallet: what accepting costs; null/absent while billing is off. `provisional`: no price yet — settled later */
  fee?: { amountAmd: number; provisional: boolean } | null
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
  /** hasBase: dispatch falls back to his base location when the GPS is lost */
  /** blocked: an operator blocked him for orders — why, since and until when (null = until lifted) */
  driver: { name: string; kind: 'SITE_LINKED' | 'APP_ONLY'; hasBase?: boolean; blocked?: { reason: string | null; until: string | null; since: string } | null }
  availability: Availability
  switches: { wantsOnline: boolean; externalBusy: boolean }
  trackingConsentVersion: number | null
  currentOffer: CurrentOffer | null
  activeOrder: ActiveOrder | null
  tracking: TrackingPolicyDto
  /** Driver wallet (2026-11-12). `low`: billing on and not enough for the base fee — no offers until topped up */
  wallet?: { billingEnabled: boolean; balanceAmd: number; creditLimitAmd?: number; low: boolean }
}

export type WalletEntryKind = 'TOPUP' | 'TOPUP_BONUS' | 'ORDER_FEE' | 'ORDER_FEE_ADJUSTMENT' | 'ORDER_FEE_REFUND' | 'ADMIN_CREDIT' | 'ADMIN_DEBIT'

/** One statement line; `amountAmd` is signed (+ in, − out) */
export interface WalletEntry {
  id: number
  kind: WalletEntryKind
  amountAmd: number
  balanceAfterAmd: number
  orderNumber: string | null
  note: string | null
  createdAt: string
}

export type TopupStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED'

export interface WalletTopup {
  paymentId: number
  amountAmd: number
  status: TopupStatus
  createdAt: string
}

/**
 * The fee schedule (2026-11-12): free up to `freeMaxPriceAmd`, `baseAmd` up to
 * `baseMaxPriceAmd`, above that `percent` of the whole price rounded to
 * `roundAmd`, never below `baseAmd`, never above `maxAmd` (0 = no cap).
 */
export interface WalletFees {
  freeMaxPriceAmd?: number
  baseAmd: number
  baseMaxPriceAmd: number
  percent: number
  roundAmd: number
  maxAmd: number
}

/** `GET /driver-app/me/wallet` */
export interface WalletResponse {
  billingEnabled: boolean
  balanceAmd: number
  /** How far below zero an operator lets him go and still get orders (0 = not at all) */
  creditLimitAmd?: number
  fees: WalletFees
  /** `bonus`: a top-up at or above `fromAmd` earns `percent` on top (empty = no bonuses) */
  topup: { minAmd: number; maxAmd: number; bonus?: { fromAmd: number; percent: number }[] }
  topupAvailable: boolean
  entries: WalletEntry[]
  topups: WalletTopup[]
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
  /** The paging cursor (`?before=`); absent on a server older than 2026-11-11 */
  assignedAt?: string
  vehicle?: { make: string | null; model: string | null }
  problemDescription?: string
  cancelReason?: string | null
  route?: { meters: number; seconds: number | null } | null
  timeline?: { assignedAt: string | null; enRouteAt: string | null; arrivedAt: string | null; transportStartedAt: string | null }
}

/**
 * An offer the driver let run out (`GET /driver-app/orders/missed`, 2026-11).
 * Never the customer's contact, never who took the order.
 */
export interface MissedOffer {
  offerId: string
  /** The paging cursor (`?before=`) */
  offeredAt: string
  expiresAt: string
  /** NOT_DELIVERED: never reached the phone · TOO_LATE: answered after the deadline · NO_ANSWER: rang, no answer */
  reason: 'NOT_DELIVERED' | 'TOO_LATE' | 'NO_ANSWER'
  toPickup: { roadMeters: number | null; etaSeconds: number | null; straightLineMeters: number | null }
  /** What became of the order: another driver took it, it was cancelled, still being placed, or done */
  outcome: 'TAKEN' | 'CANCELLED' | 'OPEN' | 'CLOSED'
  order: {
    number: string
    pickupAddress: string
    destinationAddress: string | null
    vehicle: { make: string | null; model: string | null }
    problemDescription: string
    price: { mode: string; amountAmd: number | null }
    route: { meters: number; seconds: number | null } | null
  }
}

/** The moderation queue of the driver's profile edits (backend DriverProfileChangeStatusApi) */
export interface ProfileChangeStatus {
  pending: { id: number; fields: { field: string; before: unknown; after: unknown }[]; createdAt: string } | null
  lastReviewed: { id: number; status: 'APPROVED' | 'REJECTED'; rejectionReason?: string; reviewedAt?: string } | null
}

/**
 * Where the driver's website profile stands (backend SiteListingService):
 * an app sign-up is hidden from the site until it asks and an admin publishes it.
 */
export type SiteListingState = 'LISTED' | 'APP_ONLY' | 'REQUESTED' | 'REJECTED' | 'DEACTIVATED'
export interface SiteListingView {
  state: SiteListingState
  url: string | null
  requestedAt: string | null
  rejectionReason: string | null
  telegramLinked: boolean
  telegramAvailable: boolean
}

/** `GET /driver-app/me/profile` — `profile` is the website's own TowTruck shape */
export type ProfileResponse =
  | { kind: 'SITE_LINKED'; siteActive: boolean; site?: SiteListingView; profile: import('~/types/towTruck').TowTruck; change: ProfileChangeStatus }
  | {
      kind: 'APP_ONLY'
      appAccount: { driverName: string; phone: string; vehicleType: string; capacityTons: number | null; wheelSkates: boolean; vehicleDescription: string | null; createdAt: string }
    }
