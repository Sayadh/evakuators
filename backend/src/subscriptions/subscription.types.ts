import type { DeactivationReason, SubscriptionPaymentStatus } from '@prisma/client'
import type { PaymentStatus } from './subscription-status'
import type { SubscriptionPlanCode } from './subscription-plans'

/** One plan as the driver's dashboard receives it — `id` is the plan code, see subscription-plans.ts */
export interface SubscriptionPlanApi {
  id: SubscriptionPlanCode
  code: SubscriptionPlanCode
  title: string
  description: string
  durationMonths: number
  price: number
  currency: string
  features: string[]
}

/** `GET /my/subscription-plans` — wrapped in `items` so the list can gain metadata without a breaking change */
export interface SubscriptionPlansApi {
  items: SubscriptionPlanApi[]
}

/**
 * One payment as its own driver sees it.
 *
 * `towTruckId` is echoed back deliberately even though the caller is that
 * driver: it is the value the API derived from the JWT, and showing it is how
 * a client can tell it never had to send one.
 */
export interface SubscriptionPaymentApi {
  id: number
  towTruckId: number
  planCode: string
  /** The plan's title at display time, or the bare code if that plan has since been retired */
  planTitle: string
  amount: number
  currency: string
  durationMonths: number
  /** ISO datetime */
  periodStart: string
  /** ISO datetime */
  periodEnd: string
  status: SubscriptionPaymentStatus
  /** ISO datetime */
  createdAt: string
}

/**
 * One pending request as the admin's queue shows it — the payment, plus just
 * enough of the driver to know who is asking without a second request.
 */
export interface AdminPendingPaymentApi extends SubscriptionPaymentApi {
  driver: {
    id: number
    name: string
    companyName?: string
    phone: string
  }
}

/**
 * Where the signed-in driver's own subscription stands — what the dashboard
 * decides its gate from.
 *
 * Read on every dashboard load rather than carried in the login response like
 * `mustChangePassword`: a session outlives a subscription, so a copy taken at
 * login is stale by definition. Same reasoning, and same shape of fix, as
 * `GET /my/tow-truck/privacy-consent` being the authoritative answer over
 * `DriverSession.requiresPrivacyConsent`.
 */
export interface MySubscriptionStatusApi {
  status: PaymentStatus
  /** ISO datetime — how far this driver is covered. Undefined = never confirmed. */
  paidUntil?: string
  /** Whole days until `paidUntil`, floored, never negative. 0 once it has passed. */
  daysLeft: number
  /** True when the dashboard must show nothing but the payment block — see isLockedOut */
  locked: boolean
  /**
   * Whether this driver is still listed on the site, and why not.
   *
   * Carried here rather than read from `GET /my/tow-truck`, which refuses a
   * deactivated driver outright (`MyTowTruckService.getMine`) — that refusal
   * is the security boundary and stays exactly as it is, so the dashboard
   * needs somewhere else to learn WHY it cannot load a profile.
   *
   * Only `UNPAID` is ever seen here: any other deactivation is refused at
   * login, so that driver never holds a token to ask with.
   */
  isActive: boolean
  deactivationReason?: DeactivationReason
}
