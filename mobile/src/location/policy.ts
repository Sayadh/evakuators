/**
 * Applies the server's tracking policy on the phone: adaptive interval by
 * state and movement, plus JITTER so 400 phones do not report in lock-step.
 * The OS may deliver less often than asked (iOS especially) — this is a
 * request, not a guarantee, and nothing in the app depends on exact timing.
 */
export type TrackingMode = 'OFF' | 'IDLE_STATIONARY' | 'IDLE_MOVING' | 'ACTIVE_ORDER'

export interface TrackingPolicy {
  mode: TrackingMode
  locationIntervalSeconds: number | null
  heartbeatIntervalSeconds: number | null
  distanceFilterMeters: number | null
  jitterSeconds: number
}

/** A fallback when the app has not heard from the server yet */
export const DEFAULT_POLICY: TrackingPolicy = {
  mode: 'IDLE_STATIONARY',
  locationIntervalSeconds: 60,
  heartbeatIntervalSeconds: 45,
  distanceFilterMeters: 100,
  jitterSeconds: 10,
}

export function jittered(baseSeconds: number, jitterSeconds: number, random: () => number = Math.random): number {
  const offset = (random() * 2 - 1) * jitterSeconds
  return Math.max(5, Math.round((baseSeconds + offset) * 1000) / 1000)
}

export function shouldTrack(policy: TrackingPolicy): boolean {
  return policy.mode !== 'OFF' && policy.locationIntervalSeconds !== null
}

/** Did the policy change enough to restart the OS location task? */
export function needsRestart(previous: TrackingPolicy | null, next: TrackingPolicy): boolean {
  if (!previous) return true
  return (
    previous.mode !== next.mode ||
    previous.locationIntervalSeconds !== next.locationIntervalSeconds ||
    previous.distanceFilterMeters !== next.distanceFilterMeters
  )
}
