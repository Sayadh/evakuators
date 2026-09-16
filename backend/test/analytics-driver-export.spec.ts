import { describe, expect, it } from 'vitest'
import {
  buildDriverExportRows,
  type DriverExportRow,
} from '../src/analytics/admin-drivers-export.rows'
import { AnalyticsEventType } from '../src/analytics/analytics.enums'
import { groupEventTotalsByTruck } from '../src/analytics/analytics.mapper'
import type { AnalyticsEventTotals } from '../src/analytics/analytics.types'
import { toCsv } from '../src/common/csv'

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

describe('buildDriverExportRows', () => {
  const ARAM: DriverExportRow = {
    id: 1,
    driverName: 'Արամ Պետրոսյան',
    phone: '+37491000001',
    locationName: 'Երևան, Արաբկիր',
    isPartner: true,
  }
  const NARE: DriverExportRow = {
    id: 2,
    driverName: 'Նարե Հակոբյան',
    phone: '+37491000002',
    locationName: 'Գյումրի',
    isPartner: false,
  }

  function totals(phoneClicks: number): AnalyticsEventTotals {
    return {
      [AnalyticsEventType.PAGE_VIEW]: 999,
      [AnalyticsEventType.PHONE_CLICK]: phoneClicks,
      [AnalyticsEventType.WHATSAPP_CLICK]: 888,
      [AnalyticsEventType.TELEGRAM_CLICK]: 777,
      [AnalyticsEventType.EMAIL_CLICK]: 666,
    }
  }

  it('writes the six columns the panel asks for, in order', () => {
    const [header, aram] = buildDriverExportRows(
      [ARAM],
      new Map([[1, totals(12)]]),
      new Map([[1, 4]]),
    )

    expect(header).toEqual([
      'Անուն Ազգանուն',
      'Հեռախոս',
      'Զանգեր (ընդամենը)',
      'Ուղղորդումներ (ընդամենը)',
      'Հիմնական գտնվելու վայրը',
      'Մեր վարորդը',
    ])
    expect(aram).toEqual(['Արամ Պետրոսյան', '+37491000001', '12', '4', 'Երևան, Արաբկիր', 'Այո'])
  })

  it('counts calls as phone clicks alone, not every contact tap', () => {
    // The other four counters are deliberately large in the fixture: a row
    // that summed them would be impossible to mistake for the right answer.
    const [, aram] = buildDriverExportRows([ARAM], new Map([[1, totals(3)]]), new Map())
    expect(aram?.[2]).toBe('3')
  })

  it('reads a driver with no tracked events and no referrals as two zeros', () => {
    const [, nare] = buildDriverExportRows([NARE], new Map(), new Map())
    expect(nare).toEqual(['Նարե Հակոբյան', '+37491000002', '0', '0', 'Գյումրի', 'Ոչ'])
  })

  it('marks a driver who is not ours as «Ոչ», never as an empty cell', () => {
    const [, nare] = buildDriverExportRows([NARE], new Map(), new Map())
    expect(nare?.[5]).toBe('Ոչ')
  })

  it('keeps the drivers in the order they were read', () => {
    const rows = buildDriverExportRows([NARE, ARAM], new Map(), new Map())
    expect(rows.slice(1).map((row) => row[0])).toEqual(['Նարե Հակոբյան', 'Արամ Պետրոսյան'])
  })

  it('is a header and nothing else when there are no drivers', () => {
    expect(buildDriverExportRows([], new Map(), new Map())).toHaveLength(1)
  })

  it('survives a CSV round trip with a comma in the base location', () => {
    // «Երևան, Արաբկիր» is the ordinary shape of a composed base name, so the
    // quoting in toCsv is load-bearing for this sheet rather than theoretical.
    const csv = toCsv(buildDriverExportRows([ARAM], new Map(), new Map()))
    expect(csv).toContain('"Երևան, Արաբկիր"')
  })
})
