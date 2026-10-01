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
    isActive: true,
  }
  const NARE: DriverExportRow = {
    id: 2,
    driverName: 'Նարե Հակոբյան',
    phone: '+37491000002',
    locationName: 'Գյումրի',
    isPartner: false,
    isActive: false,
  }

  /** Frozen, so «Պետք է վճարի» cannot become «Ժամկետանց է» overnight in CI */
  const NOW = new Date('2026-10-01T09:00:00.000Z')
  const DAY = 24 * 60 * 60 * 1000
  const at = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY)
  /** Nobody has paid and nobody has been billed — the overwhelmingly common row */
  const NO_COVERAGE = new Map<number, Date | null>()

  function totals(phoneClicks: number): AnalyticsEventTotals {
    return {
      [AnalyticsEventType.PAGE_VIEW]: 999,
      [AnalyticsEventType.PHONE_CLICK]: phoneClicks,
      [AnalyticsEventType.WHATSAPP_CLICK]: 888,
      [AnalyticsEventType.TELEGRAM_CLICK]: 777,
      [AnalyticsEventType.EMAIL_CLICK]: 666,
    }
  }

  it('writes the nine columns the panel asks for, in order', () => {
    const [header, aram] = buildDriverExportRows(
      [ARAM],
      new Map([[1, totals(12)]]),
      new Map([[1, 4]]),
      new Map([[1, at(20)]]),
      NOW,
    )

    expect(header).toEqual([
      'Անուն Ազգանուն',
      'Հեռախոս',
      'Զանգեր (ընդամենը)',
      'Ուղղորդումներ (ընդամենը)',
      'Հիմնական գտնվելու վայրը',
      'Մեր վարորդը',
      'Վճարում',
      'Վճարման ժամկետը',
      'Ակտիվ',
    ])
    expect(aram).toEqual([
      'Արամ Պետրոսյան',
      '+37491000001',
      '12',
      '4',
      'Երևան, Արաբկիր',
      'Այո',
      'Վճարված է',
      '21.10.2026',
      'Այո',
    ])
  })

  describe('the payment column', () => {
    function paymentCell(coveredUntil: Date | null): string {
      const [, row] = buildDriverExportRows(
        [ARAM],
        new Map(),
        new Map(),
        new Map([[1, coveredUntil]]),
        NOW,
      )
      return row?.[6] ?? ''
    }

    it('says a driver with months left is paid', () => {
      expect(paymentCell(at(30))).toBe('Վճարված է')
    })

    it('says a driver inside the warning window has to pay', () => {
      // The same five days `PAYMENT_DUE_SOON_WITHIN_DAYS` warns the driver in.
      expect(paymentCell(at(3))).toBe('Պետք է վճարի')
    })

    it('says a driver past their date is overdue', () => {
      expect(paymentCell(at(-1))).toBe('Ժամկետանց է')
    })

    it('says a driver nobody has billed has not paid', () => {
      expect(paymentCell(null)).toBe('Դեռ չի վճարել')
    })

    it('reads a driver missing from the map exactly as an explicit null', () => {
      // `findCoverage` returns no entry at all for a driver with no payments
      // and no deadline, which is the majority of the table.
      const [, row] = buildDriverExportRows([ARAM], new Map(), new Map(), NO_COVERAGE, NOW)
      expect(row?.[6]).toBe('Դեռ չի վճարել')
      expect(row?.[7]).toBe('')
    })

    it('dates the cell from the same value the word is derived from', () => {
      // A date that disagreed with the word beside it would be worse than no
      // date: both are `coveredUntil`, so they cannot.
      const [, row] = buildDriverExportRows(
        [ARAM],
        new Map(),
        new Map(),
        new Map([[1, at(-1)]]),
        NOW,
      )
      expect(row?.[6]).toBe('Ժամկետանց է')
      expect(row?.[7]).toBe('30.09.2026')
    })

    it('judges every row against one instant, not one per row', () => {
      // Read per row, a long export could put two different "todays" in one
      // file and call two identical drivers due-soon and overdue.
      const borderline = new Date(NOW.getTime() + 1_000)
      const rows = buildDriverExportRows(
        [ARAM, { ...NARE, id: 2 }],
        new Map(),
        new Map(),
        new Map([
          [1, borderline],
          [2, borderline],
        ]),
        NOW,
      )
      expect(rows[1]?.[6]).toBe(rows[2]?.[6])
    })
  })

  it('keeps «Ակտիվ» separate from the payment state', () => {
    // The interesting rows are the ones where the two disagree — a driver
    // deactivated over money. One merged cell would erase that.
    const [, nare] = buildDriverExportRows(
      [NARE],
      new Map(),
      new Map(),
      new Map([[2, at(-40)]]),
      NOW,
    )
    expect(nare?.[6]).toBe('Ժամկետանց է')
    expect(nare?.[8]).toBe('Ոչ')
  })

  it('counts calls as phone clicks alone, not every contact tap', () => {
    // The other four counters are deliberately large in the fixture: a row
    // that summed them would be impossible to mistake for the right answer.
    const [, aram] = buildDriverExportRows(
      [ARAM],
      new Map([[1, totals(3)]]),
      new Map(),
      NO_COVERAGE,
      NOW,
    )
    expect(aram?.[2]).toBe('3')
  })

  it('reads a driver with no tracked events and no referrals as two zeros', () => {
    const [, nare] = buildDriverExportRows([NARE], new Map(), new Map(), NO_COVERAGE, NOW)
    expect(nare).toEqual([
      'Նարե Հակոբյան',
      '+37491000002',
      '0',
      '0',
      'Գյումրի',
      'Ոչ',
      'Դեռ չի վճարել',
      '',
      'Ոչ',
    ])
  })

  it('marks a driver who is not ours as «Ոչ», never as an empty cell', () => {
    const [, nare] = buildDriverExportRows([NARE], new Map(), new Map(), NO_COVERAGE, NOW)
    expect(nare?.[5]).toBe('Ոչ')
  })

  it('keeps the drivers in the order they were read', () => {
    const rows = buildDriverExportRows([NARE, ARAM], new Map(), new Map(), NO_COVERAGE, NOW)
    expect(rows.slice(1).map((row) => row[0])).toEqual(['Նարե Հակոբյան', 'Արամ Պետրոսյան'])
  })

  it('is a header and nothing else when there are no drivers', () => {
    expect(buildDriverExportRows([], new Map(), new Map(), NO_COVERAGE, NOW)).toHaveLength(1)
  })

  it('survives a CSV round trip with a comma in the base location', () => {
    // «Երևան, Արաբկիր» is the ordinary shape of a composed base name, so the
    // quoting in toCsv is load-bearing for this sheet rather than theoretical.
    const csv = toCsv(buildDriverExportRows([ARAM], new Map(), new Map(), NO_COVERAGE, NOW))
    expect(csv).toContain('"Երևան, Արաբկիր"')
  })
})
