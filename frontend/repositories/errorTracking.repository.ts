/**
 * In-house error tracking (2026-11-17) — backend error-tracking module.
 * `report` is fire-and-forget from the browser; `list`/`resolve` are the
 * admin page /admin/orders/errors.
 */
import { apiFetch, getApiBase, isApiEnabled } from './apiClient'
import { useAdminAuthStore } from '~/stores/adminAuth'

export interface ErrorGroup {
  id: number
  source: 'api' | 'worker' | 'admin' | 'mobile'
  message: string
  stack: string | null
  context: Record<string, unknown>
  release: string | null
  count: number
  firstSeenAt: string
  lastSeenAt: string
  resolvedAt: string | null
}

const auth = () => ({ ...(useAdminAuthStore().authHeader as Record<string, string>) })

export const errorTrackingRepository = {
  list(status: 'open' | 'resolved') {
    return apiFetch<ErrorGroup[]>('/admin/errors', { headers: auth(), query: { status } })
  },
  resolve(id: number) {
    return apiFetch<{ resolved: boolean }>(`/admin/errors/${id}/resolve`, { method: 'POST', headers: auth() })
  },
  /**
   * Never throws and never goes through apiFetch: a failing report must not
   * trigger the expired-session redirect, nor report itself.
   */
  report(body: { message: string; stack?: string; where?: string; release?: string }): void {
    if (!isApiEnabled()) return
    try {
      void fetch(`${getApiBase()}/errors/client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'admin', ...body }),
        keepalive: true,
      }).catch(() => undefined)
    } catch {
      // nothing: reporting is best-effort
    }
  },
}
