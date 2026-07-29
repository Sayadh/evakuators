import { apiFetch } from './apiClient'
import { useAdminAuthStore } from '~/stores/adminAuth'
import { useDriverAuthStore } from '~/stores/driverAuth'
import type {
  AnalyticsCharts,
  AnalyticsOverview,
  AnalyticsRatings,
  AnalyticsReviews,
  SiteAnalyticsOverview,
  TrackAnalyticsEventPayload,
  TrackSiteEventPayload,
} from '~/types/analytics'
import type { AnalyticsPeriod, AnalyticsReviewStatus } from '~/types/enums'

/**
 * Analytics HTTP layer. Like every repository here, this is the only place
 * allowed to call apiFetch for these endpoints.
 */

/* ── Public: recording events ────────────────────────────────────────────── */

export const analyticsRepository = {
  /**
   * Unauthenticated, fire-and-forget. Resolves to nothing — the backend answers
   * 202 with an empty body whether the event counted or was a same-day
   * duplicate, so there is deliberately no result to inspect (see
   * docs/analytics.md § Security for why it stays blind).
   */
  async trackEvent(payload: TrackAnalyticsEventPayload): Promise<void> {
    await apiFetch<unknown>('/analytics/events', {
      method: 'POST',
      body: payload as unknown as Record<string, unknown>,
    })
  },

  /** Site-wide traffic for the admin panel — same fire-and-forget contract */
  async trackSiteEvent(payload: TrackSiteEventPayload): Promise<void> {
    await apiFetch<unknown>('/analytics/site-events', {
      method: 'POST',
      body: payload as unknown as Record<string, unknown>,
    })
  },
}

/** Admin-only view of the platform's own traffic — no tow truck involved */
export const adminSiteAnalyticsRepository = {
  getOverview(period: AnalyticsPeriod): Promise<SiteAnalyticsOverview> {
    return apiFetch<SiteAnalyticsOverview>('/admin/site-analytics', {
      query: { period },
      headers: useAdminAuthStore().authHeader,
    })
  },
}

/* ── Reports ─────────────────────────────────────────────────────────────── */

/** Query params shared by the review list */
export interface AnalyticsReviewsParams {
  status?: AnalyticsReviewStatus
  limit?: number
}

/** The four reports, identical for a driver and for an admin */
export interface AnalyticsReportsApi {
  getOverview(period: AnalyticsPeriod): Promise<AnalyticsOverview>
  getCharts(period: AnalyticsPeriod): Promise<AnalyticsCharts>
  getReviews(params?: AnalyticsReviewsParams): Promise<AnalyticsReviews>
  getRatings(): Promise<AnalyticsRatings>
}

/** Resolved fresh on every call so a token refresh/logout is picked up immediately */
type AnalyticsRequestContext = () => { basePath: string; headers: Record<string, string> }

/**
 * Builds one report API over a base path + auth header.
 *
 * The driver endpoints (`/my/analytics/*`, id from the JWT) and the admin
 * endpoints (`/admin/tow-trucks/:id/analytics/*`) return byte-identical shapes
 * and differ only in URL and credential — mirroring the backend, where a single
 * AnalyticsDashboardService serves both controllers. Writing the four calls
 * twice would be four opportunities for the two dashboards to drift apart.
 */
function createAnalyticsReportsApi(context: AnalyticsRequestContext): AnalyticsReportsApi {
  return {
    getOverview(period) {
      const { basePath, headers } = context()
      return apiFetch<AnalyticsOverview>(basePath, { query: { period }, headers })
    },

    getCharts(period) {
      const { basePath, headers } = context()
      return apiFetch<AnalyticsCharts>(`${basePath}/charts`, { query: { period }, headers })
    },

    getReviews(params = {}) {
      const { basePath, headers } = context()
      return apiFetch<AnalyticsReviews>(`${basePath}/reviews`, {
        query: { status: params.status, limit: params.limit },
        headers,
      })
    },

    getRatings() {
      const { basePath, headers } = context()
      return apiFetch<AnalyticsRatings>(`${basePath}/ratings`, { headers })
    },
  }
}

/**
 * Driver's own analytics. There is no id in any of these URLs on purpose — the
 * backend takes it from the signed JWT, so a driver cannot ask for anyone
 * else's numbers even by tampering with the request.
 */
export const myAnalyticsRepository: AnalyticsReportsApi = createAnalyticsReportsApi(() => ({
  basePath: '/my/analytics',
  headers: useDriverAuthStore().authHeader,
}))

/** Admin view of any single tow truck's analytics, active or deactivated */
export const adminAnalyticsRepository = {
  forTowTruck(towTruckId: number): AnalyticsReportsApi {
    return createAnalyticsReportsApi(() => ({
      basePath: `/admin/tow-trucks/${towTruckId}/analytics`,
      headers: useAdminAuthStore().authHeader,
    }))
  },
}
