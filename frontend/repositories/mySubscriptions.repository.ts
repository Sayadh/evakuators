import { apiFetch } from './apiClient'
import { useDriverAuthStore } from '~/stores/driverAuth'
import type {
  MySubscriptionStatus,
  SubscriptionPayment,
  SubscriptionPlan,
  SubscriptionPlanCode,
} from '~/types/subscription'

/** Driver self-service — always operates on the caller's own payments (JWT-scoped) */
export const mySubscriptionsRepository = {
  /**
   * Where this driver stands — read on every dashboard load, never cached in
   * the session: a session lasts 30 days and a subscription does not, so a
   * copy taken at login is stale by definition.
   */
  getStatus(): Promise<MySubscriptionStatus> {
    return apiFetch<MySubscriptionStatus>('/my/subscription-payments/status', {
      headers: useDriverAuthStore().authHeader,
    })
  },

  getPlans(): Promise<{ items: SubscriptionPlan[] }> {
    return apiFetch<{ items: SubscriptionPlan[] }>('/my/subscription-plans', {
      headers: useDriverAuthStore().authHeader,
    })
  },

  getPayments(): Promise<SubscriptionPayment[]> {
    return apiFetch<SubscriptionPayment[]>('/my/subscription-payments', {
      headers: useDriverAuthStore().authHeader,
    })
  },

  /**
   * The whole request body is the plan code. The price, the number of months
   * and the driver id are the server's to decide — and sending any of them
   * would be REJECTED, not ignored (the backend's ValidationPipe runs with
   * `forbidNonWhitelisted`). See backend/src/subscriptions/dto/create-subscription-payment.dto.ts.
   */
  createPayment(planId: SubscriptionPlanCode): Promise<SubscriptionPayment> {
    return apiFetch<SubscriptionPayment>('/my/subscription-payments', {
      method: 'POST',
      body: { planId },
      headers: useDriverAuthStore().authHeader,
    })
  },
}
