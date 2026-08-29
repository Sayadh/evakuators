import { describe, expect, it } from 'vitest'
import { buildEstimatedArrivalAt } from '~/utils/freeRouteArrival'

/**
 * The rollover branch is the one worth pinning on its own — see the
 * function's own comment for why an arrival typed earlier than departure
 * means "next day", not "invalid".
 */
describe('buildEstimatedArrivalAt', () => {
  const departure = new Date('2026-08-07T12:00:00')

  it('returns null when either field is empty', () => {
    expect(buildEstimatedArrivalAt(departure, '', '19:00')).toBeNull()
    expect(buildEstimatedArrivalAt(departure, '2026-08-07', '')).toBeNull()
  })

  it('combines the date and time as-is when the arrival is later the same day', () => {
    const result = buildEstimatedArrivalAt(departure, '2026-08-07', '19:00')
    expect(result).toEqual(new Date('2026-08-07T19:00:00'))
  })

  it('rolls over to the next day when the arrival clock time is before departure', () => {
    // Departs 22:00, "arrives" 03:00 on the clock — an overnight trip, not a
    // driver who typed a time in the past.
    const lateDeparture = new Date('2026-08-07T22:00:00')
    const result = buildEstimatedArrivalAt(lateDeparture, '2026-08-07', '03:00')
    expect(result).toEqual(new Date('2026-08-08T03:00:00'))
  })

  it('rolls over on an exact tie too — arrival cannot equal departure', () => {
    const result = buildEstimatedArrivalAt(departure, '2026-08-07', '12:00')
    expect(result).toEqual(new Date('2026-08-08T12:00:00'))
  })
})
