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
  /** 2026-11-17: the driver backed out for a customer reason and is already free */
  | 'CUSTOMER_PENDING'

/**
 * NOT_SPECIFIED only ever comes from a driver who picked no reason in time, and
 * CUSTOMER_WILL_CALL only from a driver backing out (2026-11-17) — an operator
 * cancel can choose neither (DRIVER_ONLY_CANCEL_REASONS)
 */
export type CancelReason =
  | 'DRIVER_CANNOT_PERFORM'
  | 'CUSTOMER_DECLINED'
  | 'WRONG_DATA'
  | 'PRICE_NOT_AGREED'
  | 'TECHNICAL_PROBLEM'
  | 'OTHER'
  | 'NOT_SPECIFIED'
  | 'CUSTOMER_WILL_CALL'
export type PaymentStatus = 'UNKNOWN' | 'UNPAID' | 'PAID'
export type PricingMode = 'FIXED' | 'NEGOTIATION_REQUIRED'
export type ProgressAction = 'EN_ROUTE' | 'ARRIVED' | 'START_TRANSPORT' | 'COMPLETE'

export interface OpsPoint {
  latitude: number
  longitude: number
  address: string
}

/** Pickup only (product decision, 2026-11): coordinates may be unknown — a "phone it in" order, manual-assign only. */
/** 2026-11-17: how sure the operator is of the pickup coordinates */
export type PickupPrecision = 'EXACT' | 'APPROXIMATE'

export interface OpsPickupPoint {
  latitude: number | null
  longitude: number | null
  address: string
  /** Null without coordinates, or on an order created before 2026-11-17 */
  precision?: PickupPrecision | null
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
  /** 2026-11-17: the driver who handed this order to us (referred order) */
  referrerDriverId?: number | null
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
  /** Referred order (2026-11-17): who handed it over and where his share stands */
  referral?: {
    driverId: number
    name: string | null
    phone: string | null
    status: 'CREDITED' | 'WAITING' | 'SKIPPED' | 'PENDING'
    creditedAmd: number | null
    skipReason: string | null
  } | null
  /** The operator's 1–5 for the completed job (2026-11-17) */
  rating?: { score: number; comment: string | null; driverId: number; ratedAt: string } | null
  priceReviews?: { id: number; driverId: number; priceAmd: number; status: 'PENDING' | 'APPROVED' | 'CORRECTED' | 'VOID'; correctedPriceAmd: number | null; note: string | null; createdAt: string; resolvedAt: string | null }[]
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
  /** Signed up in the app: a hidden website profile (TowTruck.appOnly), not a website registration */
  appOnly?: boolean
  /** The driver was told about a lost connection / GPS (2026-11-16) */
  problemAlert?: { reason: 'CONNECTION' | 'GPS' | string; count: number; at: string | null } | null
  /** Taken Offline automatically (2026-11-18): 3 offers in a row never reached his phone; cleared when he presses Online */
  autoOffline?: { reason: 'UNDELIVERED_OFFERS' | string; at: string } | null
  /** The operator's 1–5 ratings of completed jobs (2026-11-17) */
  rating?: { average: number; count: number } | null
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
  driverStatus?: string
  balanceAmd: number
  creditLimitAmd?: number
  /** Mirrors dispatch: below the base fee he is offered no paid orders */
  orderStatus?: OpsWalletOrderStatus
  /** How much more he needs before a base-fee order can be offered */
  shortfallAmd?: number
  completedOrders?: number
  /** Over the same `days` window as the summary: money in, net fees, fee orders */
  periodInAmd?: number
  periodFeesAmd?: number
  periodFeeOrders?: number
  updatedAt: string | null
}

export type OpsWalletOrderStatus = 'OK' | 'LOW_BALANCE' | 'BILLING_OFF' | 'NOT_ACTIVE'

/** `GET /ops/dispatch/wallets/summary` */
export interface OpsWalletSummary {
  days: number
  billingEnabled: boolean
  totals: { topupsAmd: number; topupsCount: number; bonusesAmd: number; feesNetAmd: number; feeOrders: number; refundsAmd: number; adminCreditsAmd: number; adminDebitsAmd: number; referralsAmd?: number; referralsCount?: number }
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

export type OpsWalletEntryKind =
  | 'TOPUP'
  | 'TOPUP_BONUS'
  | 'ORDER_FEE'
  | 'ORDER_FEE_ADJUSTMENT'
  | 'ORDER_FEE_REFUND'
  | 'ADMIN_CREDIT'
  | 'ADMIN_DEBIT'
  | 'REFERRAL_CREDIT'

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

/** `GET /ops/dispatch/stats` (2026-11-17) */
export interface OpsStats {
  days: number
  orders: { created: number; completed: number; cancelled: number; open: number; searchFailed: number }
  timeToAssign: { orders: number; medianSeconds: number | null; p90Seconds: number | null }
  offers: { total: number; accepted: number; rejected: number; expired: number; revoked: number; acceptanceRate: number | null }
  cancelReasons: { by: 'OPERATOR' | 'DRIVER'; reason: string; count: number }[]
  drivers: {
    driverId: number
    name: string | null
    phone: string | null
    offers: number
    accepted: number
    rejected: number
    expired: number
    completed: number
    cancels: number
    rating: { average: number; count: number } | null
    /** Orders he handed to us, and his share paid for them (2026-11-17) */
    referred: number
    referralAmd: number
  }[]
  daily: { day: string; created: number; completed: number; cancelled: number }[]
}

// ─── Pre-orders (2026-11-17) — backend pre-orders/pre-orders.ts ─────────────

export interface OpsPreOrder {
  id: number
  status: 'OPEN' | 'CLOSED'
  /** Prices still accepted: until the operator closes it (no deadline) */
  open: boolean
  createdAt: string
  closedAt: string | null
  pickup: OpsPickupPoint
  destination: { latitude: number | null; longitude: number | null; address: string } | null
  vehicle: { make: string | null; model: string | null; weightKg: number | null }
  requirements: {
    wheelsRoll: boolean | null
    steeringLocked: boolean | null
    gearboxLocked: boolean | null
    needsManipulator: boolean | null
    needsWheelSkates: boolean | null
    wheelSkatesCount: number | null
  }
  /** What the drivers read */
  comment: string
  customer: { phone: string | null; name: string | null }
  internalNote: string | null
  /** Push rounds (1 at creation, +1 per «Կրկին ծանուցել»), drivers reached by the last, when */
  notify: { rounds: number; drivers: number; at: string | null }
}

export interface OpsPreOrderListItem extends OpsPreOrder {
  /** Drivers reached by the last push round */
  recipients: number
  bids: number
  bestAmd: number | null
  /** Orders made from it so far */
  orders: number
}

export interface OpsPreOrderBid {
  driverId: number
  name: string | null
  phone: string | null
  vehicleType: string
  capacityTons: number | null
  priceAmd: number
  updatedAt: string
  rating: { average: number; count: number } | null
  busy: boolean
  distanceMeters: number | null
}

/** One order made from a pre-order («Պատվեր տալ»); several are allowed */
export interface OpsPreOrderConversion {
  orderId: number
  number: string
  status: OrderStatus
  driverId: number
  driverName: string | null
  priceAmd: number
  /** How the offer to that driver went: PENDING / ACCEPTED / REJECTED / EXPIRED / … */
  offerStatus: string | null
  createdAt: string
}

export interface OpsPreOrderDetail {
  preOrder: OpsPreOrder
  recipients: number
  bids: OpsPreOrderBid[]
  orders: OpsPreOrderConversion[]
}
