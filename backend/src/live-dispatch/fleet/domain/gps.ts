/**
 * Validation and classification of GPS fixes sent by the driver app.
 *
 * Pure functions, no I/O: the repository feeds them the server's receive time
 * and the stored current fix, and writes what they decide.
 *
 * The rules, in the order they bite:
 *
 * 1. A fix that is not a real number, not on Earth, outside Armenia's box,
 *    with an impossible accuracy, measured in the future (beyond a small
 *    clock-skew allowance) or absurdly long ago is REFUSED — not stored at all.
 * 2. Among the accepted fixes, at most ONE can become the driver's current
 *    position: the newest by sequence, and only if it is still fresh
 *    (measured within `gpsMaxAgeSeconds` of receipt). An offline buffer
 *    flushed on reconnect therefore lands in history, never as "where the
 *    driver is now".
 * 3. Whether that candidate actually replaces the stored current fix is the
 *    database's decision (session + sequence + measuredAt monotonicity,
 *    `FleetRepository.ingestLocations`) — so two requests racing each other
 *    cannot move a driver backwards.
 * 4. An implausible jump marks the fix `suspicious`. A suspicious current fix
 *    does not make a driver dispatchable, but nothing is blocked
 *    automatically: the next consistent fix clears it by itself.
 */
import { isWithinArmenia } from '../../../common/armenia-bounds'
import type { DispatchSettings } from '../../platform/settings'

export interface IncomingFix {
  seq: number
  latitude: number
  longitude: number
  accuracyM: number
  /** ISO-8601 from the device clock */
  measuredAt: string
  speedMps?: number | null
  headingDeg?: number | null
}

export type FixRejection =
  | 'NOT_A_NUMBER'
  | 'OUT_OF_RANGE'
  | 'OUTSIDE_SERVICE_AREA'
  | 'BAD_ACCURACY'
  | 'ACCURACY_TOO_LOW'
  | 'BAD_SEQUENCE'
  | 'BAD_TIMESTAMP'
  | 'FROM_THE_FUTURE'
  | 'TOO_OLD'
  | 'DUPLICATE_IN_BATCH'

export interface AcceptedFix {
  seq: number
  latitude: number
  longitude: number
  accuracyM: number
  measuredAt: Date
  speedMps: number | null
  headingDeg: number | null
  /** Received too long after measurement to describe the present */
  late: boolean
}

export interface ClassifiedBatch {
  accepted: AcceptedFix[]
  rejected: { seq: number | null; reason: FixRejection }[]
  /** The single fix allowed to compete for "current position", if any */
  currentCandidate: AcceptedFix | null
}

export type GpsRules = Pick<
  DispatchSettings,
  | 'gpsMaxAgeSeconds'
  | 'gpsRejectAccuracyMeters'
  | 'gpsFutureToleranceSeconds'
  | 'gpsMaxHistoryAgeHours'
  | 'gpsSuspiciousSpeedMps'
>

export const MAX_FIXES_PER_REQUEST = 50

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function validateFix(
  fix: IncomingFix,
  receivedAt: Date,
  rules: GpsRules,
): { ok: true; fix: AcceptedFix } | { ok: false; reason: FixRejection } {
  if (!Number.isSafeInteger(fix.seq) || fix.seq < 0) return { ok: false, reason: 'BAD_SEQUENCE' }
  if (!finite(fix.latitude) || !finite(fix.longitude)) return { ok: false, reason: 'NOT_A_NUMBER' }
  if (Math.abs(fix.latitude) > 90 || Math.abs(fix.longitude) > 180) return { ok: false, reason: 'OUT_OF_RANGE' }
  if (!isWithinArmenia(fix.latitude, fix.longitude)) return { ok: false, reason: 'OUTSIDE_SERVICE_AREA' }
  if (!finite(fix.accuracyM) || fix.accuracyM < 0) return { ok: false, reason: 'BAD_ACCURACY' }
  if (fix.accuracyM > rules.gpsRejectAccuracyMeters) return { ok: false, reason: 'ACCURACY_TOO_LOW' }

  if (typeof fix.measuredAt !== 'string') return { ok: false, reason: 'BAD_TIMESTAMP' }
  const measuredAt = new Date(fix.measuredAt)
  if (Number.isNaN(measuredAt.getTime())) return { ok: false, reason: 'BAD_TIMESTAMP' }

  const leadMs = measuredAt.getTime() - receivedAt.getTime()
  if (leadMs > rules.gpsFutureToleranceSeconds * 1000) return { ok: false, reason: 'FROM_THE_FUTURE' }
  const ageMs = -leadMs
  if (ageMs > rules.gpsMaxHistoryAgeHours * 3600_000) return { ok: false, reason: 'TOO_OLD' }

  // A device clock slightly ahead is tolerated, but the stored time is clamped
  // to the receive time so a fix can never look fresher than physically possible.
  const effectiveMeasuredAt = leadMs > 0 ? receivedAt : measuredAt

  return {
    ok: true,
    fix: {
      seq: fix.seq,
      latitude: Math.round(fix.latitude * 1e6) / 1e6,
      longitude: Math.round(fix.longitude * 1e6) / 1e6,
      accuracyM: fix.accuracyM,
      measuredAt: effectiveMeasuredAt,
      speedMps: finite(fix.speedMps) && fix.speedMps >= 0 && fix.speedMps < 150 ? fix.speedMps : null,
      headingDeg:
        finite(fix.headingDeg) && fix.headingDeg >= 0 && fix.headingDeg < 360 ? fix.headingDeg : null,
      late: ageMs > rules.gpsMaxAgeSeconds * 1000,
    },
  }
}

export function classifyBatch(fixes: IncomingFix[], receivedAt: Date, rules: GpsRules): ClassifiedBatch {
  const accepted: AcceptedFix[] = []
  const rejected: ClassifiedBatch['rejected'] = []
  const seen = new Set<number>()

  for (const fix of fixes) {
    const result = validateFix(fix, receivedAt, rules)
    if (!result.ok) {
      rejected.push({ seq: Number.isSafeInteger(fix?.seq) ? fix.seq : null, reason: result.reason })
      continue
    }
    if (seen.has(result.fix.seq)) {
      rejected.push({ seq: result.fix.seq, reason: 'DUPLICATE_IN_BATCH' })
      continue
    }
    seen.add(result.fix.seq)
    accepted.push(result.fix)
  }

  accepted.sort((a, b) => a.seq - b.seq)

  // Newest by sequence; it must ALSO be fresh. If the newest is late, an
  // older fix in the same batch is even later, so there is no candidate.
  const newest = accepted[accepted.length - 1] ?? null
  const currentCandidate = newest && !newest.late ? newest : null

  return { accepted, rejected, currentCandidate }
}

const EARTH_RADIUS_M = 6_371_008.8

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = Math.PI / 180
  const dLat = (bLat - aLat) * toRad
  const dLng = (bLng - aLng) * toRad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export interface StoredFix {
  latitude: number
  longitude: number
  accuracyM: number
  measuredAt: Date
}

/**
 * Whether `next` is an implausible jump from `previous`.
 *
 * The accuracies are subtracted from the distance first: two fixes 300 m apart
 * with ±200 m each are not evidence of movement at all. What remains, over the
 * time between them, is the speed the driver would have needed.
 */
export function suspiciousJump(
  previous: StoredFix | null,
  next: AcceptedFix,
  maxSpeedMps: number,
): string | null {
  if (!previous) return null
  const distance = haversineMeters(previous.latitude, previous.longitude, next.latitude, next.longitude)
  const unexplained = distance - previous.accuracyM - next.accuracyM
  if (unexplained <= 250) return null
  const seconds = (next.measuredAt.getTime() - previous.measuredAt.getTime()) / 1000
  if (seconds <= 0) return `jump of ${Math.round(distance)} m with no elapsed time`
  const speed = unexplained / seconds
  if (speed > maxSpeedMps) return `implied speed ${Math.round(speed)} m/s over ${Math.round(seconds)} s`
  return null
}

/**
 * Adaptive tracking cadence the server suggests to the app.
 *
 * The app applies jitter and the OS decides what it actually delivers — this
 * is a request, never a promise (iOS in particular coalesces background
 * updates). Returned with every ingest/heartbeat response so the policy can
 * change without an app release.
 */
export type TrackingMode = 'OFF' | 'IDLE_STATIONARY' | 'IDLE_MOVING' | 'ACTIVE_ORDER'

export interface TrackingPolicy {
  mode: TrackingMode
  locationIntervalSeconds: number | null
  heartbeatIntervalSeconds: number | null
  distanceFilterMeters: number | null
  jitterSeconds: number
}

export function trackingPolicy(input: {
  wantsOnline: boolean
  hasActiveOrder: boolean
  lastSpeedMps: number | null
}): TrackingPolicy {
  if (input.hasActiveOrder) {
    return {
      mode: 'ACTIVE_ORDER',
      locationIntervalSeconds: 12,
      heartbeatIntervalSeconds: 30,
      distanceFilterMeters: 25,
      jitterSeconds: 3,
    }
  }
  if (!input.wantsOnline) {
    return { mode: 'OFF', locationIntervalSeconds: null, heartbeatIntervalSeconds: null, distanceFilterMeters: null, jitterSeconds: 0 }
  }
  if (input.lastSpeedMps !== null && input.lastSpeedMps > 1.5) {
    return {
      mode: 'IDLE_MOVING',
      locationIntervalSeconds: 40,
      heartbeatIntervalSeconds: 45,
      distanceFilterMeters: 100,
      jitterSeconds: 8,
    }
  }
  return {
    mode: 'IDLE_STATIONARY',
    locationIntervalSeconds: 90,
    heartbeatIntervalSeconds: 45,
    distanceFilterMeters: 150,
    jitterSeconds: 10,
  }
}
