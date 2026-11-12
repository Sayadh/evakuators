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
  locationIntervalSeconds: 55,
  heartbeatIntervalSeconds: 45,
  distanceFilterMeters: 0,
  jitterSeconds: 5,
}

export function jittered(baseSeconds: number, jitterSeconds: number, random: () => number = Math.random): number {
  const offset = (random() * 2 - 1) * jitterSeconds
  return Math.max(5, Math.round((baseSeconds + offset) * 1000) / 1000)
}

export function shouldTrack(policy: TrackingPolicy): boolean {
  return policy.mode !== 'OFF' && policy.locationIntervalSeconds !== null
}

/**
 * What the OS location task is started with. Only this decides a restart
 * (2026-11): every restart re-posts Android's "Evakuators · Ընդունում եք
 * պատվերներ" notification, and the server switches IDLE_STATIONARY ↔
 * IDLE_MOVING with the driver's speed — it popped up after almost every fix.
 * Both idle modes now share one OS request (the faster cadence, `IDLE_OS_SECONDS`)
 * and the app keeps one fix per the CURRENT policy's interval (`keepFix`).
 * A restart is left for going online/offline, an order starting or ending
 * (other accuracy, other notification text) and GPS recovery.
 */
export type ServiceClass = 'OFF' | 'IDLE' | 'ACTIVE'

/** The OS cadence for both idle modes: the shorter one (IDLE_MOVING, backend fleet/domain/gps.ts) */
export const IDLE_OS_SECONDS = 30

export function serviceClass(policy: TrackingPolicy): ServiceClass {
  if (!shouldTrack(policy)) return 'OFF'
  return policy.mode === 'ACTIVE_ORDER' ? 'ACTIVE' : 'IDLE'
}

/** The interval the OS is asked for: idle modes share one, so moving ↔ standing needs no restart */
export function osIntervalSeconds(policy: TrackingPolicy): number {
  const interval = policy.locationIntervalSeconds ?? DEFAULT_POLICY.locationIntervalSeconds!
  return serviceClass(policy) === 'IDLE' ? Math.min(interval, IDLE_OS_SECONDS) : interval
}

/** Did the policy change enough to restart the OS location task? */
export function needsRestart(previous: TrackingPolicy | null, next: TrackingPolicy): boolean {
  if (!previous) return true
  return serviceClass(previous) !== serviceClass(next) || previous.distanceFilterMeters !== next.distanceFilterMeters
}

/**
 * Time-based thinning. The OS is asked for every fix (no distance gate — a
 * driver standing still must keep reporting, or he silently goes GPS-stale and
 * stops getting offers), so it may deliver one per second; keep one per
 * policy interval. 0.8 × so a fix that arrives a little early is not dropped
 * and then followed by a gap of almost two intervals.
 */
export function keepFix(lastKeptAtMs: number | null, fixAtMs: number, intervalSeconds: number): boolean {
  return lastKeptAtMs === null || fixAtMs - lastKeptAtMs >= intervalSeconds * 1000 * 0.8
}

/** Foreground floor: is the newest fix old enough that we should ask the OS for one now? */
export function fixIsDue(lastKeptAtMs: number | null, nowMs: number, intervalSeconds: number): boolean {
  return lastKeptAtMs === null || nowMs - lastKeptAtMs >= intervalSeconds * 1000
}
