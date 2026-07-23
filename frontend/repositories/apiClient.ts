import { FetchError } from 'ofetch'

/**
 * Single entry point for all HTTP communication with the NestJS backend.
 * Components/composables/services NEVER call endpoints directly —
 * they go through the repositories built on top of this client.
 */

/** Full backend base URL, already including the /api/v1 prefix (NUXT_PUBLIC_API_BASE_URL) */
export function getApiBase(): string {
  return useRuntimeConfig().public.apiBaseUrl
}

/** When no API base is configured the app runs on local mock data */
export function isApiEnabled(): boolean {
  return getApiBase().length > 0
}

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH'
  query?: Record<string, string | number | boolean | undefined>
  body?: BodyInit | Record<string, unknown>
  /** e.g. { Authorization: `Bearer ${token}` } for driver-authenticated calls */
  headers?: Record<string, string>
}

export function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return $fetch<T>(path, {
    baseURL: getApiBase(),
    method: options.method ?? 'GET',
    query: options.query,
    body: options.body,
    headers: options.headers,
  })
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof FetchError && error.statusCode === 404
}
