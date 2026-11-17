/**
 * What the admin pages report to the in-house error tracker (2026-11-17).
 * Pure, so the filtering has a direct test (plugins/error-report.client.ts is
 * the thin Nuxt glue around it).
 */
import { isAdminRoute } from './isAdminRoute'

/** Noise that is not ours: extensions, network blips the UI already shows, aborted navigations */
const IGNORED = [/ResizeObserver loop/i, /chrome-extension:\/\//i, /moz-extension:\/\//i, /Failed to fetch/i, /NetworkError/i, /Load failed/i, /AbortError/i, /Navigation cancelled/i]

export interface ReportableError {
  message: string
  stack?: string
}

/** null = do not report */
export function toReport(error: unknown, path: string): ReportableError | null {
  if (!isAdminRoute(path)) return null
  const message = error instanceof Error ? `${error.name}: ${error.message}` : typeof error === 'string' ? error : JSON.stringify(error ?? 'unknown')
  const stack = error instanceof Error ? error.stack : undefined
  if (IGNORED.some((pattern) => pattern.test(message) || (stack ? pattern.test(stack) : false))) return null
  // API errors are recorded by the backend itself (5xx) or are expected (4xx): not twice
  if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) return null
  return { message: message.slice(0, 1000), ...(stack ? { stack: stack.slice(0, 8000) } : {}) }
}

/** At most this many reports per page load — a render loop must not hammer the API */
export const MAX_REPORTS_PER_PAGE = 10
