/**
 * The pure half of the app's error reporting (2026-11-17) — testable without
 * React Native. See errorReport.ts.
 */
export interface MobileErrorReport {
  source: 'mobile'
  message: string
  stack?: string
  where?: string
  release?: string
  context?: Record<string, unknown>
}

/** At most this many reports per app launch: a render loop must not drain the battery or the API */
export const MAX_REPORTS_PER_LAUNCH = 10

/** Network blips are shown to the driver already; not bugs */
const IGNORED = [/Network request failed/i, /NetworkError/i, /timeout/i, /AbortError/i]

export function toMobileReport(error: unknown, extra: { fatal?: boolean; release?: string; platform?: string }): MobileErrorReport | null {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : typeof error === 'string' ? error : JSON.stringify(error ?? 'unknown')
  if (IGNORED.some((p) => p.test(message))) return null
  const stack = error instanceof Error && error.stack ? error.stack.slice(0, 8000) : undefined
  return {
    source: 'mobile',
    message: message.slice(0, 1000),
    ...(stack ? { stack } : {}),
    ...(extra.release ? { release: extra.release.slice(0, 60) } : {}),
    context: { fatal: extra.fatal === true, ...(extra.platform ? { platform: extra.platform } : {}) },
  }
}
