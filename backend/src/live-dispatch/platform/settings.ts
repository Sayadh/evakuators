/**
 * Every live-dispatch tunable, its default, and its allowed range.
 *
 * Defaults are the starting values from the product brief. They are read
 * from the `DispatchSetting` table at the start of each unit of work (a
 * dispatch step, an ingest) and validated there too, so a bad row cannot
 * reach the engine: an out-of-range stored value falls back to its default
 * and is reported, rather than crashing the worker.
 *
 * GPS freshness and heartbeat freshness are deliberately separate keys — a
 * fresh heartbeat does NOT make an old fix fresh.
 */
export interface DispatchSettings {
  /** A fix older than this (by measuredAt) is not a present position */
  gpsMaxAgeSeconds: number
  /** A fix less accurate than this cannot make a driver dispatchable */
  gpsMaxAccuracyMeters: number
  /** Fixes worse than this are refused outright at ingest */
  gpsRejectAccuracyMeters: number
  /** No heartbeat for longer than this = the app is not reachable */
  heartbeatMaxAgeSeconds: number
  /** Allowed device-clock lead over the server for measuredAt */
  gpsFutureToleranceSeconds: number
  /** Older than this at receipt is refused even as history */
  gpsMaxHistoryAgeHours: number
  /** Implied speed above this marks a fix suspicious */
  gpsSuspiciousSpeedMps: number

  offerTimeoutSeconds: number
  searchAlertSeconds: number
  searchMaxSeconds: number
  maxOffersPerAttempt: number
  candidateBatchSize: number
  candidateRouteMaxAgeSeconds: number
  /** ETAs within this many seconds of each other count as a tie */
  etaTieSeconds: number
  /** Search radii, stage by stage, inside Yerevan */
  yerevanRadiiMeters: number[]
  /** Search radii, stage by stage, elsewhere */
  regionRadiiMeters: number[]

  /** Assigned but no "en route" after this → alert (never reassign) */
  notMovingAlertSeconds: number
  /** Active-order driver with no fresh GPS for this long → alert */
  activeGpsLostAlertSeconds: number

  locationHistoryRetentionDays: number
  routingDailyElementBudget: number
  publicNearbyLiveLimit: number
}

export const DEFAULT_DISPATCH_SETTINGS: DispatchSettings = {
  gpsMaxAgeSeconds: 120,
  gpsMaxAccuracyMeters: 150,
  gpsRejectAccuracyMeters: 2000,
  heartbeatMaxAgeSeconds: 90,
  gpsFutureToleranceSeconds: 30,
  gpsMaxHistoryAgeHours: 24,
  gpsSuspiciousSpeedMps: 70,

  offerTimeoutSeconds: 30,
  searchAlertSeconds: 90,
  searchMaxSeconds: 600,
  maxOffersPerAttempt: 25,
  candidateBatchSize: 10,
  candidateRouteMaxAgeSeconds: 120,
  etaTieSeconds: 60,
  yerevanRadiiMeters: [8_000, 20_000, 40_000],
  regionRadiiMeters: [25_000, 60_000, 120_000],

  notMovingAlertSeconds: 300,
  activeGpsLostAlertSeconds: 180,

  locationHistoryRetentionDays: 30,
  routingDailyElementBudget: 20_000,
  publicNearbyLiveLimit: 10,
}

type NumberRange = { min: number; max: number }

const RANGES: { [K in keyof DispatchSettings]: DispatchSettings[K] extends number ? NumberRange : { min: number; max: number; length: NumberRange } } = {
  gpsMaxAgeSeconds: { min: 15, max: 1800 },
  gpsMaxAccuracyMeters: { min: 5, max: 2000 },
  gpsRejectAccuracyMeters: { min: 50, max: 20_000 },
  heartbeatMaxAgeSeconds: { min: 15, max: 1800 },
  gpsFutureToleranceSeconds: { min: 0, max: 600 },
  gpsMaxHistoryAgeHours: { min: 1, max: 168 },
  gpsSuspiciousSpeedMps: { min: 20, max: 300 },
  offerTimeoutSeconds: { min: 10, max: 300 },
  searchAlertSeconds: { min: 15, max: 3600 },
  searchMaxSeconds: { min: 60, max: 7200 },
  maxOffersPerAttempt: { min: 1, max: 200 },
  candidateBatchSize: { min: 1, max: 25 },
  candidateRouteMaxAgeSeconds: { min: 0, max: 900 },
  etaTieSeconds: { min: 0, max: 600 },
  yerevanRadiiMeters: { min: 500, max: 300_000, length: { min: 1, max: 6 } },
  regionRadiiMeters: { min: 500, max: 300_000, length: { min: 1, max: 6 } },
  notMovingAlertSeconds: { min: 60, max: 7200 },
  activeGpsLostAlertSeconds: { min: 30, max: 7200 },
  locationHistoryRetentionDays: { min: 1, max: 365 },
  routingDailyElementBudget: { min: 0, max: 10_000_000 },
  publicNearbyLiveLimit: { min: 1, max: 25 },
}

export const SETTING_KEYS = Object.keys(DEFAULT_DISPATCH_SETTINGS) as (keyof DispatchSettings)[]

/** One key's value against its range; returns an error string or null */
export function validateSetting(key: string, value: unknown): string | null {
  if (!(key in RANGES)) return `unknown setting "${key}"`
  const range = RANGES[key as keyof DispatchSettings] as NumberRange & { length?: NumberRange }
  if (range.length) {
    if (!Array.isArray(value)) return `${key} must be an array of numbers`
    if (value.length < range.length.min || value.length > range.length.max) {
      return `${key} must have ${range.length.min}–${range.length.max} entries`
    }
    for (let i = 0; i < value.length; i++) {
      const item = value[i]
      if (typeof item !== 'number' || !Number.isFinite(item) || item < range.min || item > range.max) {
        return `${key}[${i}] must be a number in ${range.min}–${range.max}`
      }
      if (i > 0 && item <= (value[i - 1] as number)) return `${key} must be strictly increasing`
    }
    return null
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return `${key} must be a finite number`
  if (value < range.min || value > range.max) return `${key} must be in ${range.min}–${range.max}`
  return null
}

/** Cross-field rules a single key cannot express */
export function validateCombination(settings: DispatchSettings): string[] {
  const errors: string[] = []
  if (settings.searchAlertSeconds >= settings.searchMaxSeconds) {
    errors.push('searchAlertSeconds must be smaller than searchMaxSeconds')
  }
  if (settings.gpsMaxAccuracyMeters > settings.gpsRejectAccuracyMeters) {
    errors.push('gpsMaxAccuracyMeters must not exceed gpsRejectAccuracyMeters')
  }
  if (settings.offerTimeoutSeconds >= settings.searchMaxSeconds) {
    errors.push('offerTimeoutSeconds must be smaller than searchMaxSeconds')
  }
  return errors
}

/**
 * Merges stored rows over the defaults. Invalid stored values are dropped
 * (default kept) and reported through `onInvalid` — a typo in one row must
 * not stop dispatch.
 */
export function resolveSettings(
  stored: { key: string; value: unknown }[],
  onInvalid: (key: string, reason: string) => void = () => undefined,
): DispatchSettings {
  const merged: DispatchSettings = { ...DEFAULT_DISPATCH_SETTINGS }
  for (const row of stored) {
    const reason = validateSetting(row.key, row.value)
    if (reason) {
      onInvalid(row.key, reason)
      continue
    }
    ;(merged as unknown as Record<string, unknown>)[row.key] = row.value
  }
  const combined = validateCombination(merged)
  if (combined.length > 0) {
    for (const reason of combined) onInvalid('*', reason)
    return { ...DEFAULT_DISPATCH_SETTINGS }
  }
  return merged
}
