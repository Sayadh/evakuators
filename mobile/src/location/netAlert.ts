/**
 * When to say «Ինտերնետ չկա» (2026-11-16, problemNotification.ts). Pure, so
 * it is unit-tested: after NET_ALERT_AFTER_MS of failed sends, then every
 * NET_ALERT_EVERY_MS, at most NET_ALERT_MAX times; one successful send
 * starts over (and takes the notification away).
 */
export const NET_ALERT_AFTER_MS = 120_000
export const NET_ALERT_EVERY_MS = 300_000
export const NET_ALERT_MAX = 3

export interface NetAlertState {
  /** First failed send of the current outage (ms) */
  failSince: number | null
  count: number
  lastAt: number | null
}

export const NO_OUTAGE: NetAlertState = { failSince: null, count: 0, lastAt: null }

export function onNetFailure(state: NetAlertState | undefined, now: number): { state: NetAlertState; alert: boolean } {
  const s = state ?? NO_OUTAGE
  const failSince = s.failSince ?? now
  if (now - failSince < NET_ALERT_AFTER_MS || s.count >= NET_ALERT_MAX) return { state: { ...s, failSince }, alert: false }
  if (s.lastAt !== null && now - s.lastAt < NET_ALERT_EVERY_MS) return { state: { ...s, failSince }, alert: false }
  return { state: { failSince, count: s.count + 1, lastAt: now }, alert: true }
}

export function onNetSuccess(state: NetAlertState | undefined): { state: NetAlertState; dismiss: boolean } {
  return { state: NO_OUTAGE, dismiss: (state?.count ?? 0) > 0 }
}
