import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  formatCount,
  formatDateKeyLong,
  formatDateKeyShort,
  formatDateLong,
  formatDateNumeric,
  formatDepartureAt,
  formatDepartureRange,
} from '~/utils/formatters'
import { formatPrice, formatPricePerKm, formatStartingPrice } from '~/utils/formatPrice'

/**
 * These formatters exist because `toLocaleDateString('hy-AM', …)` produced a
 * different string on the server than in the visitor's browser, which Vue
 * reported as "Hydration completed but contains mismatches" and which showed
 * Armenian users a Russian date. See the comment block in `utils/formatters.ts`.
 *
 * A test that only checked "does it return the right string here" would have
 * passed against the old code too — this runtime has full ICU and the Armenia
 * timezone, which is exactly the environment where the bug is invisible. So the
 * tests below deliberately attack the two things that used to vary:
 *
 *   1. the runtime's default locale  → asserted via output, and structurally
 *      by refusing any `hy` locale tag in the source
 *   2. the runtime's default timezone → asserted by moving `process.env.TZ`
 */

const SOURCE = readFileSync(fileURLToPath(new URL('../utils/formatters.ts', import.meta.url)), 'utf8')

/**
 * Comments stripped, because the rule below is about what the code *does*.
 * The file documents the bug it was written to fix, and naming
 * `toLocaleDateString` in that explanation must not be what fails the test —
 * the first version of this spec did exactly that.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/** 2026-08-07T16:15Z is 20:15 in Yerevan — the case from the original bug report */
const DEPARTURE = '2026-08-07T16:15:00.000Z'

/**
 * Written as an escape, never as a literal character. Grouped numbers use
 * U+00A0 so they cannot wrap across two lines, and a plain U+0020 typed into an
 * expectation looks identical in every editor and diff — the first draft of
 * these tests failed with "expected '15 000 ֏' to be '15 000 ֏'".
 */
const NBSP = '\u00A0'

describe('formatDepartureAt', () => {
  it('renders the day before the month, as Armenian requires', () => {
    // The old code answered "օգոստոսի 7, 20:15" — English word order with
    // Armenian words, which is why no locale string could have fixed it.
    expect(formatDepartureAt(DEPARTURE)).toBe('7 օգոստոսի, 20:15')
  })

  it('renders Armenia time, not the reader’s time', () => {
    // Same instant, three very different machines. A tow truck leaving an
    // Armenian city departs at one time; that time does not change because
    // somebody reads the page from Los Angeles.
    const original = process.env.TZ
    try {
      for (const timezone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Yerevan']) {
        process.env.TZ = timezone
        expect(formatDepartureAt(DEPARTURE), `TZ=${timezone}`).toBe('7 օգոստոսի, 20:15')
      }
    } finally {
      process.env.TZ = original
    }
  })

  it('uses a 24-hour clock with no AM/PM marker', () => {
    // '2-digit' hours alone can still resolve to a 12-hour cycle depending on
    // the locale, which would append "AM"/"PM" — hence the explicit hourCycle.
    expect(formatDepartureAt('2026-08-07T04:05:00.000Z')).toBe('7 օգոստոսի, 08:05')
    expect(formatDepartureAt('2026-01-31T20:00:00.000Z')).toBe('1 փետրվարի, 00:00')
  })

  it('crosses into the next Armenian day at the right instant', () => {
    // 19:59 UTC is still the 7th in Yerevan; 20:00 UTC is already the 8th.
    expect(formatDepartureAt('2026-08-07T19:59:00.000Z')).toBe('7 օգոստոսի, 23:59')
    expect(formatDepartureAt('2026-08-07T20:00:00.000Z')).toBe('8 օգոստոսի, 00:00')
  })
})

describe('formatDepartureRange', () => {
  const DEPARTURE_20_15 = '2026-08-07T16:15:00.000Z' // 7-ի 20:15 Երևանում

  it('falls back to formatDepartureAt alone when there is no arrival time', () => {
    // A route posted before estimatedArrivalAt existed.
    expect(formatDepartureRange(DEPARTURE_20_15)).toBe(formatDepartureAt(DEPARTURE_20_15))
  })

  it('renders a same-day range as one date with two clock times', () => {
    const arrival = '2026-08-07T19:00:00.000Z' // 7-ի 23:00 Երևանում
    expect(formatDepartureRange(DEPARTURE_20_15, arrival)).toBe('7 օգոստոսի, 20:15–23:00')
  })

  it('repeats the date on the arrival side once the trip crosses midnight', () => {
    const arrival = '2026-08-08T03:00:00.000Z' // 8-ի 07:00 Երևանում
    expect(formatDepartureRange(DEPARTURE_20_15, arrival)).toBe('7 օգոստոսի, 20:15 – 8 օգոստոսի, 07:00')
  })

  it('keeps working across a runtime timezone other than Yerevan', () => {
    const original = process.env.TZ
    try {
      process.env.TZ = 'America/Los_Angeles'
      const arrival = '2026-08-07T19:00:00.000Z'
      expect(formatDepartureRange(DEPARTURE_20_15, arrival)).toBe('7 օգոստոսի, 20:15–23:00')
    } finally {
      process.env.TZ = original
    }
  })
})

describe('formatDateLong', () => {
  it('spells the month and marks the year', () => {
    expect(formatDateLong(DEPARTURE)).toBe('7 օգոստոսի 2026 թ.')
  })

  it('resolves the year in Armenia time too', () => {
    // 31 December 21:00 UTC is already 1 January in Yerevan — a review posted
    // then must not be filed under the previous year.
    expect(formatDateLong('2025-12-31T21:00:00.000Z')).toBe('1 հունվարի 2026 թ.')
  })
})

describe('formatDateNumeric', () => {
  it('zero-pads both halves so a column stays aligned', () => {
    expect(formatDateNumeric('2026-08-07T16:15:00.000Z')).toBe('07.08.2026')
    expect(formatDateNumeric('2026-11-30T10:00:00.000Z')).toBe('30.11.2026')
  })
})

describe('formatDateKey* (calendar-day keys, not instants)', () => {
  it('never constructs a Date, so the day cannot shift', () => {
    const original = process.env.TZ
    try {
      for (const timezone of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
        process.env.TZ = timezone
        expect(formatDateKeyLong('2026-07-27'), `TZ=${timezone}`).toBe('27 հուլիսի')
      }
    } finally {
      process.env.TZ = original
    }
  })

  it('drops the leading zero when spelling a day, keeps it when compact', () => {
    expect(formatDateKeyLong('2026-01-05')).toBe('5 հունվարի')
    expect(formatDateKeyShort('2026-01-05')).toBe('05.01')
  })

  it('covers all twelve months', () => {
    const months = Array.from({ length: 12 }, (_, index) =>
      formatDateKeyLong(`2026-${String(index + 1).padStart(2, '0')}-01`),
    )
    expect(months).toEqual([
      '1 հունվարի',
      '1 փետրվարի',
      '1 մարտի',
      '1 ապրիլի',
      '1 մայիսի',
      '1 հունիսի',
      '1 հուլիսի',
      '1 օգոստոսի',
      '1 սեպտեմբերի',
      '1 հոկտեմբերի',
      '1 նոյեմբերի',
      '1 դեկտեմբերի',
    ])
  })
})

describe('formatCount', () => {
  it('groups thousands with a non-breaking space', () => {
    expect(formatCount(12345)).toBe(`12${NBSP}345`)
    expect(formatCount(1234567)).toBe(`1${NBSP}234${NBSP}567`)
    // Asserted by code point too, so U+00A0 is pinned rather than merely
    // copied into an expectation that happens to look right.
    expect(formatCount(12345).charCodeAt(2)).toBe(0x00a0)
  })

  it('leaves short numbers alone', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(999)).toBe('999')
    expect(formatCount(1000)).toBe(`1${NBSP}000`)
  })
})

describe('formatPrice', () => {
  /**
   * Prices had the same bug as dates, and it reached further: `TowTruckCard`
   * renders on the homepage, so `Intl.NumberFormat('hy-AM')` was a mismatch on
   * the site's most-visited page for anyone whose browser fell back to a locale
   * that groups with a comma.
   */
  it('groups with a non-breaking space, never a comma or a dot', () => {
    expect(formatPrice(15000)).toBe(`15${NBSP}000 ֏`)
    expect(formatPrice(15000)).not.toContain(',')
    expect(formatPrice(15000)).not.toContain('.')
    expect(formatPrice(1500000)).toBe(`1${NBSP}500${NBSP}000 ֏`)
  })

  it('leaves prices under a thousand ungrouped', () => {
    expect(formatPrice(300)).toBe('300 ֏')
    expect(formatPricePerKm(300)).toBe('300 ֏/կմ')
  })

  it('composes the derived forms from the same base', () => {
    expect(formatStartingPrice(15000)).toBe(`սկսած 15${NBSP}000 ֏`)
  })

  it('no longer asks a runtime to group the digits', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../utils/formatPrice.ts', import.meta.url)),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(source).not.toMatch(/Intl\.NumberFormat|toLocaleString/)
  })
})

describe('the source itself', () => {
  /**
   * The regression guard. Every bug in this file's history came from asking the
   * runtime for a localised *word*; re-introducing that is a one-line edit that
   * would look perfectly reasonable in review and would only misbehave on a
   * machine configured unlike the developer's.
   */
  it('never asks a runtime for Armenian words', () => {
    expect(CODE).not.toMatch(/toLocaleDateString|toLocaleTimeString|toLocaleString/)
    expect(CODE).not.toMatch(/['"]hy(-AM)?['"]/)
  })

  it('pins every option that could otherwise vary by machine', () => {
    for (const option of ["timeZone: 'Asia/Yerevan'", "hourCycle: 'h23'", "numberingSystem: 'latn'"]) {
      expect(CODE, `missing ${option}`).toContain(option)
    }
  })
})
