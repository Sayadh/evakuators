/**
 * Live dispatch console — `/ops/dispatch/*` (ADMIN or DISPATCHER).
 *
 * Every mutation sends an Idempotency-Key generated ONCE per user action, so
 * a double click or a retried request after a timeout cannot do it twice.
 * Callers create the key when the operator presses the button and reuse it
 * if they retry that same action.
 */
import { apiFetch } from './apiClient'
import { useAdminAuthStore } from '~/stores/adminAuth'
import type {
  FleetDriver,
  FleetDriverKind,
  FleetDriverStatus,
  FleetSiteCandidate,
  OpsAlert,
  OpsMapDriver,
  OpsOrder,
  OpsDriverWallet,
  OpsOrderDetail,
  OpsPriceReview,
  OpsWalletRow,
  OpsWalletSummary,
  ProgressAction,
} from '~/types/opsDispatch'

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}

function auth(key?: string): Record<string, string> {
  const headers: Record<string, string> = { ...(useAdminAuthStore().authHeader as Record<string, string>) }
  if (key) headers['Idempotency-Key'] = key
  return headers
}

const base = '/ops/dispatch'

export const opsDispatchRepository = {
  listOrders(query: { status?: string; search?: string; limit?: number; cursor?: string | null }) {
    return apiFetch<{ items: OpsOrder[]; nextCursor: string | null }>(`${base}/orders`, {
      headers: auth(),
      query: { status: query.status, search: query.search, limit: query.limit, cursor: query.cursor ?? undefined },
    })
  },
  getOrder(id: number) {
    return apiFetch<OpsOrderDetail>(`${base}/orders/${id}`, { headers: auth() })
  },
  createOrder(body: Record<string, unknown>, key: string) {
    return apiFetch<OpsOrder>(`${base}/orders`, { method: 'POST', headers: auth(key), body })
  },
  updateOrder(id: number, body: Record<string, unknown>, key: string) {
    return apiFetch<OpsOrder>(`${base}/orders/${id}`, { method: 'PATCH', headers: auth(key), body })
  },
  action(id: number, action: 'start' | 'stop' | 'cancel' | 'confirm-price' | 'payment' | 'progress' | 'release' | 'resume' | 'flag' | 'override-requirements', body: Record<string, unknown>, key: string) {
    return apiFetch<OpsOrder>(`${base}/orders/${id}/${action}`, { method: 'POST', headers: auth(key), body })
  },
  progress(id: number, action: ProgressAction, expectedVersion: number, key: string) {
    return this.action(id, 'progress', { action, expectedVersion }, key)
  },
  manualOffer(id: number, body: { driverId: number; overrideReason?: string | null; expectedVersion: number }, key: string) {
    return apiFetch<{ offerId: string; expiresAt: string }>(`${base}/orders/${id}/manual-offer`, { method: 'POST', headers: auth(key), body })
  },
  computeRoute(id: number) {
    return apiFetch<{ computed: boolean; reason?: string; meters?: number; seconds?: number }>(`${base}/orders/${id}/route`, { method: 'POST', headers: auth() })
  },
  manualRoute(id: number, meters: number, seconds: number | null) {
    return apiFetch<{ stored: boolean }>(`${base}/orders/${id}/route/manual`, { method: 'POST', headers: auth(), body: { meters, seconds } })
  },
  driverMap(query: { bbox?: string; onlyOnline?: boolean }) {
    return apiFetch<{ serverTime: string; gpsMaxAgeSeconds: number; items: OpsMapDriver[] }>(`${base}/drivers/map`, {
      headers: auth(),
      query: { bbox: query.bbox, onlyOnline: query.onlyOnline ? 'true' : undefined },
    })
  },
  /** Block (or unblock) a driver for orders: a reason he sees, optionally for `days` (then it lifts by itself) */
  suspendDriver(driverId: number, suspended: boolean, reason: string | null, days?: number | null) {
    return apiFetch<{ ok: true }>(`${base}/drivers/${driverId}/suspend`, { method: 'POST', headers: auth(), body: { suspended, reason, ...(days ? { days } : {}) } })
  },
  alerts() {
    return apiFetch<OpsAlert[]>(`${base}/alerts`, { headers: auth() })
  },
  ackAlert(id: number) {
    return apiFetch<{ ok: true }>(`${base}/alerts/${id}/ack`, { method: 'POST', headers: auth() })
  },
  /** Driver wallet (2026-11-12): every balance, lowest first */
  wallets() {
    return apiFetch<OpsWalletRow[]>(`${base}/wallets`, { headers: auth() })
  },
  driverWallet(driverId: number, before?: number) {
    return apiFetch<OpsDriverWallet>(`${base}/drivers/${driverId}/wallet`, { headers: auth(), query: { before } })
  },
  /** Wallet money over the last `days`, debts, who is low, reviews waiting */
  walletSummary(days = 30) {
    return apiFetch<OpsWalletSummary>(`${base}/wallets/summary`, { headers: auth(), query: { days } })
  },
  /** ADMIN only: how far below zero this driver may go and still get orders */
  setCreditLimit(driverId: number, creditLimitAmd: number, key: string) {
    return apiFetch<{ driverId: number; balanceAmd: number; creditLimitAmd: number; availableAmd: number }>(`${base}/drivers/${driverId}/wallet/credit-limit`, {
      method: 'PUT',
      headers: auth(key),
      body: { creditLimitAmd },
    })
  },
  /** Minimum prices drivers entered, waiting for a call */
  priceReviews() {
    return apiFetch<OpsPriceReview[]>(`${base}/price-reviews`, { headers: auth() })
  },
  resolvePriceReview(id: number, body: { decision: 'APPROVE' | 'CORRECT'; correctedPriceAmd?: number; note?: string }, key: string) {
    return apiFetch<OpsOrder>(`${base}/price-reviews/${id}`, { method: 'POST', headers: auth(key), body })
  },
  /** ADMIN only: + credit / − debit, with the note the driver sees */
  adjustWallet(driverId: number, body: { amountAmd: number; note?: string }, key: string) {
    return apiFetch<{ driverId: number; balanceAmd: number }>(`${base}/drivers/${driverId}/wallet/adjustments`, { method: 'POST', headers: auth(key), body })
  },
  settings() {
    return apiFetch<Record<string, number | number[]>>(`${base}/settings`, { headers: auth() })
  },
  updateSettings(body: Record<string, unknown>) {
    return apiFetch<Record<string, number | number[]>>(`${base}/settings`, { method: 'PATCH', headers: auth(), body })
  },
  // ─── App access (ADMIN only) ───
  fleet(query: { status?: FleetDriverStatus; kind?: FleetDriverKind; q?: string }) {
    return apiFetch<FleetDriver[]>(`${base}/fleet`, { headers: auth(), query: { status: query.status, kind: query.kind, q: query.q || undefined } })
  },
  siteCandidates(q: string) {
    return apiFetch<FleetSiteCandidate[]>(`${base}/fleet/site-candidates`, { headers: auth(), query: { q } })
  },
  grantSiteAccess(towTruckId: number) {
    return apiFetch<FleetDriver>(`${base}/fleet/grant`, { method: 'POST', headers: auth(), body: { towTruckId } })
  },
  fleetAction(id: number, action: 'approve' | 'reactivate' | 'delete-account') {
    return apiFetch<FleetDriver>(`${base}/fleet/${id}/${action}`, { method: 'POST', headers: auth() })
  },
  fleetActionWithReason(id: number, action: 'reject' | 'suspend', reason: string) {
    return apiFetch<FleetDriver>(`${base}/fleet/${id}/${action}`, { method: 'POST', headers: auth(), body: { reason } })
  },
  linkToSite(id: number, towTruckId: number) {
    return apiFetch<FleetDriver>(`${base}/fleet/${id}/link-site`, { method: 'POST', headers: auth(), body: { towTruckId } })
  },
  health() {
    return apiFetch<{ flags: { dispatch: boolean; tracking: boolean }; outbox: { backlog: number; oldestDueSeconds: number | null; deadLetters: number } }>(`${base}/health`, { headers: auth() })
  },
}
