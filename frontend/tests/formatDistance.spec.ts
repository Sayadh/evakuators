import { describe, expect, it } from 'vitest'
import {
  formatDistance,
  formatDistanceLine,
  formatDuration,
  formatDurationLine,
} from '~/utils/formatDistance'

describe('formatDistance', () => {
  it('uses metres below a kilometre, rounded to 10 m', () => {
    expect(formatDistance(840)).toBe('840 մ')
    expect(formatDistance(843)).toBe('840 մ')
    expect(formatDistance(847)).toBe('850 մ')
  })

  /**
   * Never «0 մ»: the input is a road distance from a driver's stated parking
   * spot, so a figure that reads as "already here" is a claim the data cannot
   * support. The floor is one rounding step.
   */
  it('never rounds down to zero', () => {
    expect(formatDistance(0)).toBe('10 մ')
    expect(formatDistance(3)).toBe('10 մ')
  })

  it('switches to one decimal at a kilometre', () => {
    expect(formatDistance(1000)).toBe('1.0 կմ')
    expect(formatDistance(4123)).toBe('4.1 կմ')
    expect(formatDistance(9950)).toBe('9.9 կմ')
  })

  /**
   * Past 10 km the extra digit is noise next to traffic — «12 կմ» is what a
   * person says, «12.3 կմ» is what a machine says.
   */
  it('drops the decimal past 10 km', () => {
    expect(formatDistance(12_300)).toBe('12 կմ')
    expect(formatDistance(148_600)).toBe('149 կմ')
  })

  it('returns an empty string rather than a garbage figure for invalid input', () => {
    expect(formatDistance(Number.NaN)).toBe('')
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBe('')
    expect(formatDistance(-5)).toBe('')
  })
})

describe('formatDuration', () => {
  it('formats minutes', () => {
    expect(formatDuration(480)).toBe('8 րոպե')
    expect(formatDuration(3540)).toBe('59 րոպե')
  })

  /**
   * A driver 40 seconds away still needs a number a person would say out loud.
   * «0 րոպե» reads as a bug, not as "very close".
   */
  it('floors at one minute', () => {
    expect(formatDuration(0)).toBe('1 րոպե')
    expect(formatDuration(20)).toBe('1 րոպե')
  })

  it('switches to hours at 60 minutes, and omits a zero minute part', () => {
    expect(formatDuration(3600)).toBe('1 ժ')
    expect(formatDuration(5400)).toBe('1 ժ 30 ր')
    expect(formatDuration(7200)).toBe('2 ժ')
  })

  it('returns an empty string for invalid input', () => {
    expect(formatDuration(Number.NaN)).toBe('')
    expect(formatDuration(-1)).toBe('')
  })
})

describe('formatDistanceLine', () => {
  /**
   * The two prefixes are the honest part of this feature and are NOT
   * interchangeable: «Ճանապարհով» is a routed figure, «Ուղիղ գծով» ignores
   * every road, river and mountain in between. Printing one under the other's
   * label would present the worse number as if it were the better one.
   */
  it('labels a routed distance as road distance', () => {
    expect(formatDistanceLine(4123, true)).toBe('Ճանապարհով՝ մոտ 4.1 կմ')
  })

  it('labels an unrouted distance as a straight line', () => {
    expect(formatDistanceLine(4123, false)).toBe('Ուղիղ գծով՝ մոտ 4.1 կմ')
  })

  it('produces nothing at all rather than a bare label for invalid input', () => {
    expect(formatDistanceLine(Number.NaN, true)).toBe('')
  })
})

describe('formatDurationLine', () => {
  it('prefixes the estimate', () => {
    expect(formatDurationLine(480)).toBe('Մոտավոր՝ 8 րոպե')
  })

  it('produces nothing for invalid input', () => {
    expect(formatDurationLine(Number.NaN)).toBe('')
  })
})
