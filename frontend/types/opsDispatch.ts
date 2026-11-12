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
  /** A description alone is possible (2026-11): coordinates may be null */
  destination: { latitude: number | null; longitude: number | null; address: string } | null
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
  price: {
    mode: PricingMode
    currency: 'AMD'
    quotedAmd: number | null
    agreedAmd: number | null
    confirmed: boolean
    confirmedAt: string | null
    /** Who entered the agreed price (2026-11-12) */
    confirmedBy?: 'DRIVER' | 'OPERATOR' | null
  }
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
  /** Every driver the order was given to, newest first (2026-11-12) */
  assignments?: { id: number; driverId: number; name: string | null; phone: string | null; active: boolean; startedAt: string; endedAt: string | null; endReason: string | null }[]
  /** Minimum-price checks for this order, newest first (2026-11-12) */
  priceReviews?: { id: number; driverId: number; priceAmd: number; status: 'PENDING' | 'APPROVED' | 'CORRECTED'; correctedPriceAmd: number | null; note: string | null; createdAt: string; resolvedAt: string | null }[]
  /** Driver wallet lines for this order: fee, settlement, refund (2026-11-12) */
  wallet?: { netFeeAmd: number; entries: { id: number; driverId: number; kind: OpsWalletEntryKind; amountAmd: number; note: string | null; createdAt: string }[] }
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
  /** Blocked for orders by an operator: the reason the driver sees, and the end (null = until lifted) */
  block?: { reason: string | null; until: string | null; since: string | null } | null
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

/** Driver wallet (2026-11-12) — `GET /ops/dispatch/wallets` */
export interface OpsWalletRow {
  driverId: number
  name: string | null
  phone: string | null
  kind: string
  balanceAmd: number
  creditLimitAmd?: number
  completedOrders?: number
  updatedAt: string | null
}

/** `GET /ops/dispatch/wallets/summary` */
export interface OpsWalletSummary {
  days: number
  billingEnabled: boolean
  totals: { topupsAmd: number; topupsCount: number; bonusesAmd: number; feesNetAmd: number; feeOrders: number; refundsAmd: number; adminCreditsAmd: number; adminDebitsAmd: number }
  balances: { heldAmd: number; owedAmd: number; inDebt: number; belowBaseFee: number }
  pendingPriceReviews: number
  daily: { day: string; topupsAmd: number; feesNetAmd: number; feeOrders: number }[]
}

/** `GET /ops/dispatch/price-reviews` — a minimum price waiting for a call */
export interface OpsPriceReview {
  id: number
  orderId: number
  orderNumber: string
  driver: { id: number; name: string | null; phone: string | null }
  customer: { phone: string; name: string | null }
  pickupAddress: string
  destinationAddress: string | null
  routeMeters: number | null
  priceAmd: number
  createdAt: string
}

export type OpsWalletEntryKind = 'TOPUP' | 'TOPUP_BONUS' | 'ORDER_FEE' | 'ORDER_FEE_ADJUSTMENT' | 'ORDER_FEE_REFUND' | 'ADMIN_CREDIT' | 'ADMIN_DEBIT'

/** `GET /ops/dispatch/drivers/:id/wallet` */
export interface OpsDriverWallet {
  billingEnabled: boolean
  balanceAmd: number
  fees: { baseAmd: number; baseMaxPriceAmd: number; stepPriceAmd: number; stepAmd: number }
  creditLimitAmd?: number
  topup: { minAmd: number; maxAmd: number; bonus?: { fromAmd: number; percent: number }[] }
  entries: { id: number; kind: OpsWalletEntryKind; amountAmd: number; balanceAfterAmd: number; orderNumber: string | null; note: string | null; createdAt: string }[]
  topups: { paymentId: number; amountAmd: number; status: string; createdAt: string }[]
}
