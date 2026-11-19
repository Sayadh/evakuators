/**
 * The figures behind `/gner`: a dated snapshot of the prices drivers publish on
 * their profiles, not a tariff.
 *
 * `low` and `high` are the 10th and 90th percentiles, so one mistyped or unusual
 * price cannot stretch the range a customer reads. `median` is the midpoint and
 * `drivers` is how many profiles stated that price.
 *
 * To refresh: recompute every row from the public profiles, then update
 * `PRICE_GUIDE_UPDATED`.
 */
export interface PriceGuideFigure {
  low: number
  high: number
  median: number
  drivers: number
}

export const PRICE_GUIDE_UPDATED = { year: 2026, month: 11 } as const

export const PRICE_GUIDE = {
  cityCallout: { low: 5000, high: 7000, median: 5000, drivers: 128 },
  largerTruckCallout: { low: 5000, high: 10000, median: 6000, drivers: 43 },
  perKm: { low: 300, high: 500, median: 400, drivers: 46 },
  nightSurchargePercent: { low: 10, high: 30, median: 20, drivers: 40 },
  waitingPerHour: { low: 1000, high: 5000, median: 3000, drivers: 40 },
  extraLoading: { low: 3000, high: 10000, median: 5000, drivers: 42 },
  heavyDuty: { low: 6000, high: 35000, median: 15000, drivers: 12 },
  manipulator: { low: 15000, high: 35000, median: 25000, drivers: 9 },
} as const satisfies Record<string, PriceGuideFigure>

/** The distance used by the intercity example on the page */
export const PRICE_GUIDE_EXAMPLE_KM = 100
