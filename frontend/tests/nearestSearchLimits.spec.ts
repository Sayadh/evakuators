import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  NEAREST_CACHE_STORAGE_KEY,
  NEAREST_DAILY_SEARCH_LIMIT,
  NEAREST_QUOTA_STORAGE_KEY,
  NEAREST_RESULT_CACHE_TTL_MS,
} from '~/constants/nearest'
import { yerevanDateKey, formatClockTime } from '~/utils/formatters'

/**
 * The remembered half of `/evakuator`: an hour-long cache of the last answer,
 * and two fresh searches per person per day.
 *
 * There is no component runtime in this suite (docs/testing.md), so the
 * composable's reactive plumbing is not exercised here. What is: the two pure
 * pieces it stands on (the Armenia day key, which decides when «փորձեք վաղը»
 * comes true) and — asserted as source text — the handful of properties that
 * would silently undo the feature's privacy promise or its ordering.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const composable = readFileSync(`${ROOT}composables/useNearestSearch.ts`, 'utf8')
const page = readFileSync(`${ROOT}pages/evakuator.vue`, 'utf8')
const repository = readFileSync(`${ROOT}repositories/nearest.repository.ts`, 'utf8')

describe('the numbers', () => {
  it('caches an answer for exactly one hour', () => {
    expect(NEAREST_RESULT_CACHE_TTL_MS).toBe(60 * 60 * 1000)
  })

  it('allows two detailed searches a day', () => {
    expect(NEAREST_DAILY_SEARCH_LIMIT).toBe(2)
  })

  it('is longer than the backend result cache, so the two do not fight', () => {
    // The backend caches for five minutes on a rounded position; this one is
    // per person and much longer. If this were the shorter of the two, a
    // visitor pressing again would consume an allowance to be handed the
    // backend's cached answer — paying for something free.
    expect(NEAREST_RESULT_CACHE_TTL_MS).toBeGreaterThan(5 * 60 * 1000)
  })
})

describe('the day boundary', () => {
  /**
   * `«փորձեք վաղը»` has to become true when tomorrow starts in Yerevan, not
   * when it starts on the reader's device — someone in Moscow or on a phone
   * with the wrong timezone must get the same reset as everyone else, and the
   * same one the backend's own ceiling uses.
   */
  it('resolves the Armenia calendar day, not the device one', () => {
    // 21:00 UTC is already the next day in Yerevan (UTC+4).
    expect(yerevanDateKey(new Date('2026-08-12T21:00:00.000Z'))).toBe('2026-08-13')
    expect(yerevanDateKey(new Date('2026-08-12T19:00:00.000Z'))).toBe('2026-08-12')
  })

  it('pads to a stable YYYY-MM-DD, so string comparison is enough', () => {
    // The stored key is compared with `===`, never parsed — an unpadded
    // "2026-8-1" would silently never match and reset the count every visit.
    expect(yerevanDateKey(new Date('2026-01-05T10:00:00.000Z'))).toBe('2026-01-05')
    expect(yerevanDateKey(new Date('2026-11-30T10:00:00.000Z'))).toBe('2026-11-30')
  })
})

describe('the clock label on a remembered list', () => {
  it('renders Armenia time on a 24-hour clock', () => {
    // 10:30 UTC = 14:30 in Yerevan. Pinned hourCycle, so never "2:30 PM".
    expect(formatClockTime(new Date('2026-08-12T10:30:00.000Z'))).toBe('14:30')
  })

  it('pads the hour, so the label cannot jump width', () => {
    expect(formatClockTime(new Date('2026-08-12T01:05:00.000Z'))).toBe('05:05')
  })
})

describe('what is written to storage', () => {
  /**
   * The page promises the visitor's position is not stored, and
   * docs/nearest-search.md says the server's rounded cache key is the only
   * form it exists in anywhere. Caching the ANSWER rather than the QUESTION is
   * what keeps both true — and "just also save the coordinates so we can
   * refresh silently" is the obvious, plausible change that would break it.
   */
  it('never persists the coordinates, only the result', () => {
    expect(composable).toContain('savedAt')
    expect(composable).toContain('result')

    // The two names the position travels under everywhere else in this feature.
    const stored = composable.slice(composable.indexOf('interface CachedSearch'))
    expect(stored).not.toContain('latitude')
    expect(stored).not.toContain('longitude')
  })

  it('namespaces both keys, so everything this site stores is greppable', () => {
    expect(NEAREST_CACHE_STORAGE_KEY.startsWith('evakuators:')).toBe(true)
    expect(NEAREST_QUOTA_STORAGE_KEY.startsWith('evakuators:')).toBe(true)
    expect(NEAREST_CACHE_STORAGE_KEY).not.toBe(NEAREST_QUOTA_STORAGE_KEY)
  })

  it('treats every storage failure as "nothing stored" rather than throwing', () => {
    // Safari in private mode throws on access; a full origin throws on write;
    // a hand-edited entry throws on parse. All three must degrade to a first
    // visit, not to a broken page.
    expect(composable).toContain('catch')
  })
})

describe('the order the page checks things in', () => {
  /**
   * Cache first, then the request. The order is the feature: a visitor inside
   * the hour must never see a permission prompt, which only holds if the cache
   * is consulted before `locate()`.
   */
  it('serves a fresh cache before asking for a position', () => {
    const cacheCheck = page.indexOf('isCacheFresh.value')
    const locateCall = page.indexOf('await locate()')

    expect(cacheCheck).toBeGreaterThan(-1)
    expect(locateCall).toBeGreaterThan(-1)
    expect(cacheCheck).toBeLessThan(locateCall)
  })

  it('charges an allowance only after a delivered answer', () => {
    // `remember()` sits after the await, inside the try — so a refused prompt
    // (which returns early above) and a failed request (which lands in the
    // catch) both cost nothing.
    expect(page.indexOf('remember(fresh')).toBeGreaterThan(page.indexOf('await nearestRepository'))
  })

  it('degrades past the allowance instead of refusing', () => {
    /**
     * The allowance buys ROAD DATA, not the search. Spending it must never
     * turn the button into a dead end — the earlier version of this page did
     * exactly that, and someone standing next to a broken car on their third
     * look of the day got an empty screen instead of the drivers nearest them.
     *
     * Asserted as "no early exit between reading the limit and asking for the
     * position" rather than by name, because the plausible regression is
     * someone restoring the `if (limitReached) return` guard for tidiness.
     * The window stops at `locate()` deliberately: the `if (!position) return`
     * just past it is a refused permission prompt, which is a real reason to
     * stop and not the dead end being guarded.
     */
    const limitRead = page.indexOf('limitReached.value')
    const locateCall = page.indexOf('await locate()')

    expect(limitRead).toBeGreaterThan(-1)
    expect(limitRead).toBeLessThan(locateCall)
    expect(page.slice(limitRead, locateCall)).not.toContain('return')
  })

  it('asks the backend for the cheap answer rather than paying for road data', () => {
    // Without the flag the request costs the shared ORS budget exactly as much
    // as a full one, and "unlimited straight-line searches" becomes a way to
    // drain the day's budget for everyone.
    expect(page).toContain('straightLineOnly')
    expect(repository).toContain('skipRouting')
  })

  it('does not charge an allowance for a straight-line answer', () => {
    // There is nothing left to charge, and counting past the limit would make
    // the "N of 2 left" figure on screen nonsense.
    expect(page).toContain('remember(fresh, !straightLineOnly)')
  })

  it('reads storage after mount, never during render', () => {
    // localStorage does not exist on the server. Reading it while rendering
    // would either crash SSR or render one thing on the server and another in
    // the browser — over a list of drivers, not a stray class name.
    expect(page).toContain('onMounted(restore)')
  })
})
