/**
 * Background location via expo-location + expo-task-manager.
 *
 * - Android: a FOREGROUND SERVICE with a visible notification while tracking
 *   (required by Android for background location; FOREGROUND_SERVICE_LOCATION
 *   on Android 14+). iOS: "Always" permission + UIBackgroundModes location.
 * - The cadence follows the server's policy (adaptive by state/movement) with
 *   jitter, and is never longer than ~60 s. There is NO distance gate: the OS
 *   is asked for every fix and the app keeps one per interval (`keepFix`) — a
 *   distance gate starved drivers who were standing still, waiting for an
 *   order. In the foreground, `ensureFreshFix` also ASKS for a fix whenever
 *   the newest one is older than the interval (iOS may deliver nothing while
 *   the phone does not move; the simulator's fixed location never repeats).
 * - Tracking STOPS when the driver is offline and has no active order.
 * - Every fix gets a monotonic per-session `seq`. Fixes are buffered in a
 *   bounded file and flushed oldest-first; a failed flush keeps them for the
 *   next run. The server decides which fix is "now"; late ones become history.
 * - The background task also sends the heartbeat (JS timers do not run in the
 *   background).
 * - GPS RECOVERY (2026-11): the driver switches location off and on again, or
 *   grants the permission in Settings — the app notices by itself
 *   (`locationHealth`, polled by AppState while the app is open), restarts the
 *   OS task and sends a fix at once (`recoverTracking`), so offers resume
 *   without any tap. Starting the task never throws into the caller: a
 *   failed start is retried on the next snapshot.
 *
 * UNVERIFIED in this repository (no device/SDK available where it was
 * written): see docs/live-dispatch/06-mobile.md § Real-device checklist.
 */
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import { File, Paths } from 'expo-file-system'
import { api, ApiError } from '../api/client'
import type { TrackingPolicyDto } from '../api/types'
import { addFixes, nextChunk, removeSent, type Fix } from './buffer'
import { DEFAULT_POLICY, fixIsDue, jittered, keepFix, needsRestart, osIntervalSeconds, serviceClass, shouldTrack, type ServiceClass, type TrackingPolicy } from './policy'

export const LOCATION_TASK = 'evakuators-location'

interface Persisted {
  sessionId: string | null
  seq: number
  buffer: Fix[]
  policy: TrackingPolicy
  lastHeartbeatAt: number
  /** measuredAt (ms) of the newest fix kept — drives thinning and the foreground floor */
  lastFixAt?: number | null
}

const store = new File(Paths.document, 'evk-tracking.json')

async function load(): Promise<Persisted> {
  try {
    if (store.exists) return JSON.parse(await store.text()) as Persisted
  } catch {
    // corrupt file: start clean rather than crash the background task
  }
  return { sessionId: null, seq: 0, buffer: [], policy: DEFAULT_POLICY, lastHeartbeatAt: 0 }
}

async function save(state: Persisted): Promise<void> {
  store.write(JSON.stringify(state))
}

/** New login → new session → sequence restarts (the server keys order on session + seq) */
export async function bindSession(sessionId: string): Promise<void> {
  const state = await load()
  if (state.sessionId !== sessionId) await save({ ...state, sessionId, seq: 0, buffer: [] })
}

/**
 * One writer at a time (2026-11). The OS task, the foreground floor and GPS
 * recovery all record fixes; each read-modify-wrote the tracking file, so two
 * at once lost fixes or put the sequence BACK — and the server ignored every
 * fix numbered below the one it had ("GPS old" for good).
 */
let chain: Promise<unknown> = Promise.resolve()
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work)
  chain = run.catch(() => undefined)
  return run
}

let flushing = false

export function flush(): Promise<TrackingPolicy | null> {
  return serialized(flushNow)
}

async function flushNow(): Promise<TrackingPolicy | null> {
  if (flushing) return null
  flushing = true
  try {
    let state = await load()
    let policy: TrackingPolicy | null = null
    while (state.buffer.length > 0) {
      const chunk = nextChunk(state.buffer)
      const result = await api.locations(chunk)
      // Accepted AND rejected are both final answers: drop them either way.
      state = { ...state, buffer: removeSent(state.buffer, chunk), policy: result.policy as TrackingPolicyDto }
      policy = state.policy
      await save(state)
    }
    const heartbeatEvery = (state.policy.heartbeatIntervalSeconds ?? 45) * 1000
    if (Date.now() - state.lastHeartbeatAt > heartbeatEvery * 0.8) {
      await api.heartbeat()
      state = { ...state, lastHeartbeatAt: Date.now() }
      await save(state)
    }
    return policy
  } catch (error) {
    // Offline or server down: fixes stay buffered (bounded) for the next run.
    if (error instanceof ApiError && error.code === 'SESSION_REVOKED') await stopTracking()
    return null
  } finally {
    flushing = false
  }
}

/** Thins, numbers, buffers and sends OS locations — shared by the background task and the foreground floor */
function record(locations: Location.LocationObject[], force = false): Promise<void> {
  return serialized(() => recordNow(locations, force))
}

async function recordNow(locations: Location.LocationObject[], force: boolean): Promise<void> {
  const state = await load()
  const interval = state.policy.locationIntervalSeconds ?? DEFAULT_POLICY.locationIntervalSeconds!
  let seq = state.seq
  let lastFixAt = state.lastFixAt ?? null
  const fixes: Fix[] = []
  for (const l of [...locations].sort((a, b) => a.timestamp - b.timestamp)) {
    if (!force && !keepFix(lastFixAt, l.timestamp, interval)) continue
    lastFixAt = l.timestamp
    // Never below the fix's own time in ms: even a tracking file that was
    // lost or reset keeps the sequence moving forward within the session.
    seq = Math.max(seq + 1, Math.floor(l.timestamp))
    fixes.push({
      seq,
      latitude: l.coords.latitude,
      longitude: l.coords.longitude,
      accuracyM: l.coords.accuracy ?? 9999,
      measuredAt: new Date(l.timestamp).toISOString(),
      speedMps: l.coords.speed !== null && l.coords.speed >= 0 ? l.coords.speed : null,
      headingDeg: l.coords.heading !== null && l.coords.heading >= 0 ? l.coords.heading : null,
    })
  }
  if (fixes.length > 0) await save({ ...state, seq, lastFixAt, buffer: addFixes(state.buffer, fixes) })
  // Flush even with nothing new: it also carries the heartbeat.
  const policy = await flushNow()
  if (policy && needsRestart(state.policy, policy)) await applyPolicy(policy)
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return
  await record(data.locations)
})

let asking = false

/**
 * Foreground floor, called every few seconds while the app is open: when
 * tracking is on and the newest fix is older than the policy interval, ask the
 * OS for one now. Best effort — no permission, no fix, no network: try again
 * next tick.
 */
export async function ensureFreshFix(): Promise<void> {
  if (asking || !applied || !shouldTrack(applied)) return
  const state = await load()
  if (!fixIsDue(state.lastFixAt ?? null, Date.now(), state.policy.locationIntervalSeconds ?? DEFAULT_POLICY.locationIntervalSeconds!)) return
  asking = true
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: applied.mode === 'ACTIVE_ORDER' ? Location.Accuracy.High : Location.Accuracy.Balanced,
    })
    await record([location], true)
  } catch {
    // no fix this time
  } finally {
    asking = false
  }
}

let applied: TrackingPolicy | null = null

/**
 * Starts (or re-starts) the OS location task for the server's policy.
 * Never throws: no permission, location switched off or an OS refusal leave
 * `applied` unset, so the next snapshot — or GPS recovery — tries again.
 */
export async function applyPolicy(policy: TrackingPolicy): Promise<void> {
  try {
    await startFor(policy)
  } catch {
    applied = null
  }
}

async function startFor(policy: TrackingPolicy): Promise<void> {
  if (!shouldTrack(policy)) {
    await stopTracking()
    applied = policy
    return
  }
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)
  if (running && !needsRestart(applied, policy)) return
  // A fresh JS context (the app reopened, or the OS woke the task) has no
  // `applied`: the task already running for the same class is kept as it is —
  // restarting it would only flash the notification again.
  if (running && applied === null && startedClass() === serviceClass(policy)) {
    applied = policy
    return
  }
  const background = await Location.getBackgroundPermissionsAsync()
  const foreground = await Location.getForegroundPermissionsAsync()
  if (!foreground.granted) {
    applied = null
    return
  }
  const active = policy.mode === 'ACTIVE_ORDER'
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: active ? Location.Accuracy.High : Location.Accuracy.Balanced,
    timeInterval: Math.round(jittered(osIntervalSeconds(policy), policy.jitterSeconds) * 1000),
    // 0 = every fix; `record` thins by time. Never a distance gate (see top).
    distanceInterval: policy.distanceFilterMeters ?? 0,
    deferredUpdatesInterval: 0,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    // Without "Always" on iOS, updates arrive only while the app is in use.
    foregroundService: background.granted
      ? {
          notificationTitle: 'Evakuators',
          notificationBody: active ? 'Ակտիվ պատվեր · տեղադրությունն ուղարկվում է' : 'Ընդունում եք պատվերներ',
          killServiceOnDestroy: false,
        }
      : undefined,
  })
  applied = policy
  rememberStartedClass(serviceClass(policy))
}

/** The class the OS task was last started with — survives a new JS context (own file: no race with the fix buffer) */
const serviceStore = new File(Paths.document, 'evk-tracking-service.json')

function startedClass(): ServiceClass | null {
  try {
    if (!serviceStore.exists) return null
    const value = (JSON.parse(serviceStore.textSync()) as { class?: ServiceClass }).class
    return value ?? null
  } catch {
    return null
  }
}

function rememberStartedClass(value: ServiceClass): void {
  try {
    serviceStore.write(JSON.stringify({ class: value }))
  } catch {
    // best effort: without it the next new context restarts once
  }
}

// ─── GPS health and recovery ────────────────────────────────────────────────

export interface LocationHealth {
  /** The phone's location switch (Android "Location", iOS "Location Services") */
  servicesEnabled: boolean
  /** "While using" (or better) granted */
  foreground: boolean
  /** "Always" granted — needed for offers while the phone is locked */
  background: boolean
}

export async function locationHealth(): Promise<LocationHealth> {
  const [servicesEnabled, foreground, background] = await Promise.all([
    Location.hasServicesEnabledAsync().catch(() => true),
    Location.getForegroundPermissionsAsync().catch(() => null),
    Location.getBackgroundPermissionsAsync().catch(() => null),
  ])
  return { servicesEnabled, foreground: foreground?.granted === true, background: background?.granted === true }
}

/** Can the phone produce fixes at all? */
export const canLocate = (health: LocationHealth): boolean => health.servicesEnabled && health.foreground

/** A fresh fix may take a while after GPS is switched on; never wait forever */
const RECOVERY_FIX_TIMEOUT_MS = 20_000

/**
 * GPS is back (switched on, or the permission granted): start the OS task
 * afresh — a task started while location was off may stay silent on some
 * phones — and send a fix NOW instead of up to one interval later. Returns
 * whether a fix was recorded. The caller re-reads the snapshot afterwards.
 */
export async function recoverTracking(policy: TrackingPolicy | null): Promise<boolean> {
  const target = policy ?? applied
  if (!target || !shouldTrack(target)) return false
  applied = null
  await stopTracking().catch(() => undefined)
  await applyPolicy(target)
  return freshFixNow(target.mode === 'ACTIVE_ORDER')
}

/**
 * The server sees no fresh GPS while the phone can locate (2026-11). First
 * just send a fix from the RUNNING task: restarting it re-posts Android's
 * "Evakuators · Ընդունում եք պատվերներ" notification, which then popped up
 * every 45 s. Only a task that is not running, or no fix at all, gets the
 * full restart.
 */
export async function healTracking(policy: TrackingPolicy | null): Promise<boolean> {
  const target = policy ?? applied
  if (!target || !shouldTrack(target)) return false
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)
  if (running && applied && (await freshFixNow(target.mode === 'ACTIVE_ORDER'))) return true
  return recoverTracking(target)
}

async function freshFixNow(high: boolean): Promise<boolean> {
  if (asking) return false
  asking = true
  try {
    const location = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: high ? Location.Accuracy.High : Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), RECOVERY_FIX_TIMEOUT_MS)),
    ])
    if (!location) return false
    await record([location], true)
    return true
  } catch {
    return false
  } finally {
    asking = false
  }
}

export async function stopTracking(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK)
  }
  applied = null
}
