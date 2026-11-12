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
  /**
   * Base-location fallback only (product decision 2026-11: «GPS off → use
   * his base, do not drop him»): a driver whose phone stopped reporting
   * (GPS switched off, the phone locked — no background heartbeat without
   * location updates) stays a BASE candidate for this long after his last
   * heartbeat, as long as a push token can still ring his phone.
   */
  baseHeartbeatMaxAgeSeconds: number
  /** Allowed device-clock lead over the server for measuredAt */
  gpsFutureToleranceSeconds: number
  /** Older than this at receipt is refused even as history */
  gpsMaxHistoryAgeHours: number
  /** Implied speed above this marks a fix suspicious */
  gpsSuspiciousSpeedMps: number

  /** Seconds the driver has to answer, counted from the moment the offer reaches his app */
  offerTimeoutSeconds: number
  /** An offer no app has confirmed receiving within this many seconds expires, and dispatch moves on */
  offerDeliverySeconds: number
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

  /**
   * Driver wallet (2026-11-12): 1 = every accepted order costs the driver a
   * fee from his prepaid balance (wallet/domain/fees.ts), and a driver whose
   * balance cannot cover an order's fee is not offered it. 0 = off: nothing
   * is charged and nobody is filtered. A number, not a boolean, because every
   * setting here is a validated number. Off by default — switching it on is
   * a business decision taken in the console, not a deploy.
   */
  walletBillingEnabled: number
  /**
   * Orders priced at or below this cost the driver NOTHING (2026-11-12: the
   * minimum order is 5000 ֏ and earns no fee). A negotiated order agreed at
   * this price gets back the provisional fee charged at accept. 0 = no free band.
   */
  walletFeeFreeMaxPriceAmd: number
  /** The fee for an order up to `walletFeeBaseMaxPriceAmd` — and the provisional fee for an order with no price yet */
  walletFeeBaseAmd: number
  /** Orders priced up to this cost the base fee */
  walletFeeBaseMaxPriceAmd: number
  /** Above the base band: this percent of the WHOLE price (never less than the base fee) … */
  walletFeePercent: number
  /** … rounded to this many drams (100 → 1 750 becomes 1 800; 1 = exact) … */
  walletFeeRoundAmd: number
  /** … and never more than this (0 = no cap) — a big job must not push the driver off the platform */
  walletFeeMaxAmd: number
  /** Smallest / largest single top-up through Idram */
  walletMinTopupAmd: number
  walletMaxTopupAmd: number
  /**
   * A negotiated order whose pickup → destination road distance is longer
   * than this cannot be entered at the free (minimum) price — the app refuses
   * it (PRICE_TOO_LOW_FOR_DISTANCE). 0 = no such check.
   */
  walletFreeMaxRouteMeters: number
  /** 1 = a large top-up earns a bonus (TOPUP_BONUS line): see the two lists below */
  walletTopupBonusEnabled: number
  /** Top-up at or above each threshold … */
  walletTopupBonusThresholdsAmd: number[]
  /** … earns this percent on top (same length, same order) */
  walletTopupBonusPercents: number[]
  /** «Your balance is running low» push when what is left covers fewer than this many base fees */
  walletLowBalanceOrders: number
}

export const DEFAULT_DISPATCH_SETTINGS: DispatchSettings = {
  gpsMaxAgeSeconds: 120,
  gpsMaxAccuracyMeters: 150,
  gpsRejectAccuracyMeters: 2000,
  heartbeatMaxAgeSeconds: 90,
  baseHeartbeatMaxAgeSeconds: 1800,
  gpsFutureToleranceSeconds: 30,
  gpsMaxHistoryAgeHours: 24,
  gpsSuspiciousSpeedMps: 70,

  offerTimeoutSeconds: 45,
  offerDeliverySeconds: 15,
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

  locationHistoryRetentionDays: 7,
  routingDailyElementBudget: 20_000,
  publicNearbyLiveLimit: 10,

  // Product decision 2026-11-12: ≤ 5 000 ֏ free; ≤ 15 000 ֏ → 1000 ֏;
  // above → 7% of the whole price, rounded to 100 ֏, at most 6 000 ֏.
  walletBillingEnabled: 0,
  walletFeeFreeMaxPriceAmd: 5000,
  walletFeeBaseAmd: 1000,
  walletFeeBaseMaxPriceAmd: 15_000,
  walletFeePercent: 7,
  walletFeeRoundAmd: 100,
  walletFeeMaxAmd: 6000,
  walletMinTopupAmd: 1000,
  walletMaxTopupAmd: 200_000,
  walletFreeMaxRouteMeters: 5000,
  walletTopupBonusEnabled: 1,
  walletTopupBonusThresholdsAmd: [20_000, 50_000],
  walletTopupBonusPercents: [5, 10],
  walletLowBalanceOrders: 2,
}

type NumberRange = { min: number; max: number }

const RANGES: { [K in keyof DispatchSettings]: DispatchSettings[K] extends number ? NumberRange : { min: number; max: number; length: NumberRange } } = {
  gpsMaxAgeSeconds: { min: 15, max: 1800 },
  gpsMaxAccuracyMeters: { min: 5, max: 2000 },
  gpsRejectAccuracyMeters: { min: 50, max: 20_000 },
  heartbeatMaxAgeSeconds: { min: 15, max: 1800 },
  baseHeartbeatMaxAgeSeconds: { min: 15, max: 43_200 },
  gpsFutureToleranceSeconds: { min: 0, max: 600 },
  gpsMaxHistoryAgeHours: { min: 1, max: 168 },
  gpsSuspiciousSpeedMps: { min: 20, max: 300 },
  offerTimeoutSeconds: { min: 10, max: 300 },
  offerDeliverySeconds: { min: 5, max: 120 },
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
  walletBillingEnabled: { min: 0, max: 1 },
  walletFeeFreeMaxPriceAmd: { min: 0, max: 10_000_000 },
  walletFeeBaseAmd: { min: 0, max: 100_000 },
  walletFeeBaseMaxPriceAmd: { min: 0, max: 10_000_000 },
  walletFeePercent: { min: 0, max: 50 },
  walletFeeRoundAmd: { min: 1, max: 1000 },
  walletFeeMaxAmd: { min: 0, max: 1_000_000 },
  walletMinTopupAmd: { min: 100, max: 1_000_000 },
  walletMaxTopupAmd: { min: 100, max: 5_000_000 },
  walletFreeMaxRouteMeters: { min: 0, max: 1_000_000 },
  walletTopupBonusEnabled: { min: 0, max: 1 },
  walletTopupBonusThresholdsAmd: { min: 100, max: 5_000_000, length: { min: 1, max: 6 } },
  walletTopupBonusPercents: { min: 1, max: 50, length: { min: 1, max: 6 } },
  walletLowBalanceOrders: { min: 0, max: 50 },
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
  if (settings.baseHeartbeatMaxAgeSeconds < settings.heartbeatMaxAgeSeconds) {
    errors.push('baseHeartbeatMaxAgeSeconds must not be smaller than heartbeatMaxAgeSeconds')
  }
  if (settings.walletBillingEnabled !== 0 && settings.walletBillingEnabled !== 1) {
    errors.push('walletBillingEnabled must be 0 or 1')
  }
  if (settings.walletFeeFreeMaxPriceAmd >= settings.walletFeeBaseMaxPriceAmd) {
    errors.push('walletFeeFreeMaxPriceAmd must be below walletFeeBaseMaxPriceAmd')
  }
  if (settings.walletTopupBonusEnabled !== 0 && settings.walletTopupBonusEnabled !== 1) {
    errors.push('walletTopupBonusEnabled must be 0 or 1')
  }
  if (settings.walletTopupBonusThresholdsAmd.length !== settings.walletTopupBonusPercents.length) {
    errors.push('walletTopupBonusThresholdsAmd and walletTopupBonusPercents must have the same length')
  }
  if (settings.walletMinTopupAmd > settings.walletMaxTopupAmd) {
    errors.push('walletMinTopupAmd must not exceed walletMaxTopupAmd')
  }
  if (settings.walletFeeMaxAmd > 0 && settings.walletFeeMaxAmd < settings.walletFeeBaseAmd) {
    errors.push('walletFeeMaxAmd must not be below walletFeeBaseAmd')
  }
  if (!Number.isInteger(settings.walletFeeBaseAmd) || !Number.isInteger(settings.walletFeeMaxAmd) || !Number.isInteger(settings.walletFeeRoundAmd)) {
    errors.push('wallet fees must be whole drams')
  }
  if (settings.searchAlertSeconds >= settings.searchMaxSeconds) {
    errors.push('searchAlertSeconds must be smaller than searchMaxSeconds')
  }
  if (settings.gpsMaxAccuracyMeters > settings.gpsRejectAccuracyMeters) {
    errors.push('gpsMaxAccuracyMeters must not exceed gpsRejectAccuracyMeters')
  }
  if (settings.offerTimeoutSeconds >= settings.searchMaxSeconds) {
    errors.push('offerTimeoutSeconds must be smaller than searchMaxSeconds')
  }
  if (settings.offerDeliverySeconds + settings.offerTimeoutSeconds >= settings.searchMaxSeconds) {
    errors.push('offerDeliverySeconds + offerTimeoutSeconds must be smaller than searchMaxSeconds')
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
