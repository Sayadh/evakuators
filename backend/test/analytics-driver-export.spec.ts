import { describe, expect, it } from 'vitest'
import { AnalyticsEventType } from '../src/analytics/analytics.enums'
import { groupEventTotalsByTruck } from '../src/analytics/analytics.mapper'

/**
 * `groupEventTotalsByTruck` — the pivot the admin drivers CSV export reads,
 * from `sumByEventTypeForAllTrucks()`'s flat rows into one totals record per
 * truck. The property worth pinning: a truck absent from the rows entirely
 * (never had a single event) is simply absent from the map, not a row of
 * zeros — the export controller is what turns "no entry" into a zero-filled
 * column, via `emptyEventTotals()`'s own fallback.
 */
describe('groupEventTotalsByTruck', () => {
  it('buckets rows for the same truck into one record', () => {
    const byTruck = groupEventTotalsByTruck([
      { towTruckId: 1, eventType: AnalyticsEventType.PAGE_VIEW, total: 42 },
      { towTruckId: 1, eventType: AnalyticsEventType.PHONE_CLICK, total: 7 },
    ])

    expect(byTruck.get(1)).toEqual({
      [AnalyticsEventType.PAGE_VIEW]: 42,
      [AnalyticsEventType.PHONE_CLICK]: 7,
      [AnalyticsEventType.WHATSAPP_CLICK]: 0,
      [AnalyticsEventType.TELEGRAM_CLICK]: 0,
      [AnalyticsEventType.EMAIL_CLICK]: 0,
    })
  })

  it('keeps different trucks in separate entries', () => {
    const byTruck = groupEventTotalsByTruck([
      { towTruckId: 1, eventType: AnalyticsEventType.PAGE_VIEW, total: 5 },
      { towTruckId: 2, eventType: AnalyticsEventType.PAGE_VIEW, total: 9 },
    ])

    expect(byTruck.get(1)?.[AnalyticsEventType.PAGE_VIEW]).toBe(5)
    expect(byTruck.get(2)?.[AnalyticsEventType.PAGE_VIEW]).toBe(9)
  })

  it('has no entry at all for a truck with zero rows', () => {
    const byTruck = groupEventTotalsByTruck([])
    expect(byTruck.get(1)).toBeUndefined()
    expect(byTruck.size).toBe(0)
  })
})
