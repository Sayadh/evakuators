import {
  isInSubscriptionRollout,
  parseSubscriptionRollout,
} from '../src/subscriptions/subscription-rollout'
import { describe, expect, it } from 'vitest'

/**
 * `SUBSCRIPTIONS_PILOT_TOW_TRUCK_IDS` — the variable that decides whose
 * dashboard can be locked. Every case here is a way to get that wrong, and the
 * blast radius of getting it wrong is "the fleet is offline".
 */

describe('parseSubscriptionRollout', () => {
  it('treats blank as NOBODY, not as everybody', () => {
    // The whole point of the variable. `TELEGRAM_OUTBOUND_ALLOWED_CHAT_IDS`
    // reads blank as unrestricted; this one must not, because an unset
    // variable here would lock out every driver the backfill left `overdue`.
    for (const raw of ['', '   ', '\n']) {
      expect(parseSubscriptionRollout(raw)).toEqual({ mode: 'none' })
    }
  })

  it('opens to everyone only on the explicit word', () => {
    expect(parseSubscriptionRollout('all')).toEqual({ mode: 'all' })
    expect(parseSubscriptionRollout('  ALL  ')).toEqual({ mode: 'all' })
  })

  it('reads a comma-separated list of ids', () => {
    const rollout = parseSubscriptionRollout('12, 34,56')
    expect(rollout).toMatchObject({ mode: 'pilot' })
    expect(isInSubscriptionRollout(rollout, 12)).toBe(true)
    expect(isInSubscriptionRollout(rollout, 34)).toBe(true)
    expect(isInSubscriptionRollout(rollout, 56)).toBe(true)
    expect(isInSubscriptionRollout(rollout, 57)).toBe(false)
  })

  it('drops junk ids rather than throwing, and keeps the real ones', () => {
    // A typo in one id must not take the API down at boot.
    const rollout = parseSubscriptionRollout('12,,abc,-3,0,3.5,34')
    expect(isInSubscriptionRollout(rollout, 12)).toBe(true)
    expect(isInSubscriptionRollout(rollout, 34)).toBe(true)
    expect(isInSubscriptionRollout(rollout, 0)).toBe(false)
    expect(isInSubscriptionRollout(rollout, -3)).toBe(false)
  })

  it('lands on NOBODY when the list is entirely junk', () => {
    // Fails to the safe end: an unparseable list must not become "everyone".
    expect(parseSubscriptionRollout('abc,,-1')).toEqual({ mode: 'none' })
  })

  it('never lets a substring of "all" through as everyone', () => {
    const rollout = parseSubscriptionRollout('allow')
    expect(rollout).toEqual({ mode: 'none' })
    expect(isInSubscriptionRollout(rollout, 1)).toBe(false)
  })
})

describe('isInSubscriptionRollout', () => {
  it('includes nobody at all in "none"', () => {
    expect(isInSubscriptionRollout({ mode: 'none' }, 1)).toBe(false)
  })

  it('includes every driver in "all"', () => {
    expect(isInSubscriptionRollout({ mode: 'all' }, 999_999)).toBe(true)
  })
})
