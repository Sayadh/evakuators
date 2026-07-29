import { FetchError } from 'ofetch'
import { useAdminAuthStore } from '~/stores/adminAuth'
import { useDriverAuthStore } from '~/stores/driverAuth'

/**
 * Single entry point for all HTTP communication with the NestJS backend.
 * Components/composables/services NEVER call endpoints directly —
 * they go through the repositories built on top of this client.
 */

/**
 * Full backend base URL for the CURRENT execution context, already including
 * the /api/v1 prefix.
 *
 * On the server this prefers `internalApiBaseUrl` (loopback, straight to the
 * backend) and only falls back to the public URL when it isn't configured.
 * SSR fetches are made by this Nitro process, not by the visitor — sending
 * them out through the public hostname makes every visitor's rendered page
 * share one rate-limit bucket on the backend. See the runtimeConfig comment
 * in nuxt.config.ts and SsrAwareThrottlerGuard on the backend side.
 */
export function getApiBase(): string {
  const config = useRuntimeConfig()
  if (import.meta.server && config.internalApiBaseUrl) return config.internalApiBaseUrl
  return config.public.apiBaseUrl
}

/**
 * When no API base is configured the app runs on local mock data.
 *
 * Deliberately keyed off the PUBLIC url, not getApiBase(): the mock/live
 * decision must be identical on the server and in the browser, or SSR would
 * render live data that the client then replaces with mocks (or vice versa)
 * and hydration mismatches.
 */
export function isApiEnabled(): boolean {
  return useRuntimeConfig().public.apiBaseUrl.length > 0
}

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | boolean | undefined>
  body?: BodyInit | Record<string, unknown>
  /** e.g. { Authorization: `Bearer ${token}` } for driver-authenticated calls */
  headers?: Record<string, string>
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  try {
    return await $fetch<T>(path, {
      baseURL: getApiBase(),
      method: options.method ?? 'GET',
      query: options.query,
      body: options.body,
      headers: options.headers,
    })
  } catch (error) {
    await handleExpiredSession(error, path)
    throw error
  }
}

/**
 * A 401 from an already-authenticated route means the JWT expired or was
 * revoked server-side — not a wrong password/code, that only happens inside
 * the login calls themselves (`/admin-auth/*`, `/driver-auth/*`), which match
 * neither prefix below. Without this, a session that expired mid-visit just
 * shows a confusing generic error on every next click ("action failed")
 * instead of sending the person back to sign in again.
 *
 * Path prefix is what tells admin and driver sessions apart here — every
 * admin-authenticated call goes through `/admin/*` and every
 * driver-authenticated one through `/my/*` (see admin.repository.ts,
 * myTowTruck.repository.ts, myFreeRoutes.repository.ts,
 * analytics.repository.ts's myAnalyticsRepository/adminAnalyticsRepository) —
 * apiFetch itself has no other way to know which store issued the request.
 */
async function handleExpiredSession(error: unknown, path: string): Promise<void> {
  if (!import.meta.client) return
  if (!(error instanceof FetchError) || error.statusCode !== 401) return

  if (path.startsWith('/admin/')) {
    useAdminAuthStore().logout()
    await navigateTo('/admin')
  } else if (path.startsWith('/my/')) {
    useDriverAuthStore().logout()
    await navigateTo('/login')
  }
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof FetchError && error.statusCode === 404
}
