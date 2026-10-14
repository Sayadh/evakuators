import type { SubscriptionPayment } from '@prisma/client'
import { promotionPaymentTitle } from '../promotions/promotion-labels'
import { findSubscriptionPlan, type SubscriptionPlan } from './subscription-plans'
import { isSubscriptionPayment, type SubscriptionPaymentRow } from './subscriptions.repository'
import type {
  AdminPendingPaymentApi,
  AdminReviewedPaymentApi,
  SubscriptionPaymentApi,
  SubscriptionPlanApi,
} from './subscription.types'

/**
 * Plan constant → API shape. `id` duplicates `code` on purpose: `id` is what a
 * client sends back as `planId`, `code` is what reads in the UI and in the
 * stored row, and having both means neither side has to know they are the
 * same string.
 */
export function toSubscriptionPlanApi(plan: SubscriptionPlan): SubscriptionPlanApi {
  return {
    id: plan.code,
    code: plan.code,
    title: plan.title,
    description: plan.description,
    durationMonths: plan.durationMonths,
    price: plan.price,
    currency: plan.currency,
    features: [...plan.features],
  }
}

/**
 * Stored row → API shape.
 *
 * Money and duration come from the ROW, never from today's plan list — that is
 * the whole reason they are stored (see SubscriptionPayment in schema.prisma).
 * Only the human title is looked up live, and it falls back to the raw code so
 * a retired plan still renders instead of blanking a driver's history.
 */
export function toSubscriptionPaymentApi(payment: SubscriptionPaymentRow): SubscriptionPaymentApi {
  return {
    id: payment.id,
    towTruckId: payment.towTruckId,
    planCode: payment.planCode,
    planTitle: findSubscriptionPlan(payment.planCode)?.title ?? payment.planCode,
    amount: payment.amount,
    currency: payment.currency,
    durationMonths: payment.durationMonths,
    periodStart: payment.periodStart.toISOString(),
    periodEnd: payment.periodEnd.toISOString(),
    status: payment.status,
    createdAt: payment.createdAt.toISOString(),
  }
}

/**
 * Any payment row → the admin's shape for it, minus the driver.
 *
 * A subscription keeps every field it always had (plus `kind`), so the
 * subscription half of the review contract is unchanged; a placement carries
 * its own two fields and a title that says what was bought.
 */
export function toAdminPaymentSummaryApi(payment: SubscriptionPayment): AdminReviewedPaymentApi {
  if (isSubscriptionPayment(payment)) {
    return { ...toSubscriptionPaymentApi(payment), kind: payment.kind }
  }

  return {
    id: payment.id,
    towTruckId: payment.towTruckId,
    kind: payment.kind,
    planTitle: promotionPaymentTitle(payment.promotionScope, payment.promotionDays),
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    createdAt: payment.createdAt.toISOString(),
    ...(payment.promotionDays ? { promotionDays: payment.promotionDays } : {}),
    ...(payment.promotionScope ? { promotionScope: payment.promotionScope } : {}),
  }
}

/** Stored row + its driver → the admin queue's shape */
export function toAdminPendingPaymentApi(
  payment: SubscriptionPayment & {
    towTruck: { id: number; driverName: string; companyName: string | null; phone: string }
  },
): AdminPendingPaymentApi {
  return {
    ...toAdminPaymentSummaryApi(payment),
    driver: {
      id: payment.towTruck.id,
      name: payment.towTruck.driverName,
      companyName: payment.towTruck.companyName ?? undefined,
      phone: payment.towTruck.phone,
    },
  }
}
