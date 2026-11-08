/**
 * Background location via expo-location + expo-task-manager.
 *
 * - Android: a FOREGROUND SERVICE with a visible notification while tracking
 *   (required by Android for background location; FOREGROUND_SERVICE_LOCATION
 *   on Android 14+). iOS: "Always" permission + UIBackgroundModes location.
 * - The cadence follows the server's policy (adaptive by state/movement) with
 *   jitter. The OS may deliver less often — nothing depends on exact timing.
 * - Tracking STOPS when the driver is offline and has no active order.
 * - Every fix gets a monotonic per-session `seq`. Fixes are buffered in a
 *   bounded file and flushed oldest-first; a failed flush keeps them for the
 *   next run. The server decides which fix is "now"; late ones become history.
 * - The background task also sends the heartbeat (JS timers do not run in the
 *   background).
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
import { DEFAULT_POLICY, jittered, needsRestart, shouldTrack, type TrackingPolicy } from './policy'

export const LOCATION_TASK = 'evakuators-location'

interface Persisted {
  sessionId: string | null
  seq: number
  buffer: Fix[]
  policy: TrackingPolicy
  lastHeartbeatAt: number
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

let flushing = false

export async function flush(): Promise<TrackingPolicy | null> {
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

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return
  const state = await load()
  let seq = state.seq
  const fixes: Fix[] = data.locations.map((l) => ({
    seq: ++seq,
    latitude: l.coords.latitude,
    longitude: l.coords.longitude,
    accuracyM: l.coords.accuracy ?? 9999,
    measuredAt: new Date(l.timestamp).toISOString(),
    speedMps: l.coords.speed !== null && l.coords.speed >= 0 ? l.coords.speed : null,
    headingDeg: l.coords.heading !== null && l.coords.heading >= 0 ? l.coords.heading : null,
  }))
  await save({ ...state, seq, buffer: addFixes(state.buffer, fixes) })
  const policy = await flush()
  if (policy && needsRestart(state.policy, policy)) await applyPolicy(policy)
})

let applied: TrackingPolicy | null = null

export async function applyPolicy(policy: TrackingPolicy): Promise<void> {
  if (!shouldTrack(policy)) {
    await stopTracking()
    applied = policy
    return
  }
  if (!needsRestart(applied, policy) && (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) return
  const background = await Location.getBackgroundPermissionsAsync()
  const foreground = await Location.getForegroundPermissionsAsync()
  if (!foreground.granted) return
  const active = policy.mode === 'ACTIVE_ORDER'
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: active ? Location.Accuracy.High : Location.Accuracy.Balanced,
    timeInterval: Math.round(jittered(policy.locationIntervalSeconds!, policy.jitterSeconds) * 1000),
    distanceInterval: policy.distanceFilterMeters ?? 50,
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
}

export async function stopTracking(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK)
  }
  applied = null
}
