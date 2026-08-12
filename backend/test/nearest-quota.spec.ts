import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { armeniaDateKey, ARMENIA_TIMEZONE } from '../src/common/armenia-day'
import { toAnalyticsDateKey } from '../src/analytics/analytics.utils'
import { ANALYTICS_TIMEZONE } from '../src/analytics/analytics.constants'
import { NearestCacheService } from '../src/nearest/nearest-cache.service'
import { NearestQuotaService } from '../src/nearest/nearest-quota.service'
import { NearestService } from '../src/nearest/nearest.service'
import {
  NEAREST_ORS_DAILY_CALL_LIMIT,
  NEAREST_ORS_DAILY_QUOTA,
  NEAREST_ORS_DAILY_SAFETY_MARGIN,
} from '../src/nearest/nearest.constants'

/**
 * The global daily ORS-call budget behind the nearest-evacuator search.
 *
 * This replaced a per-IP daily ceiling — see docs/nearest-search.md § "The ORS
 * budget is global" for why a per-IP number could not actually bound the
 * platform's shared quota. What is worth pinning here is that "a day" means an
 * Armenia day, that yesterday's count is discarded rather than carried
 * forward, and — most of all — that running out degrades the search rather
 * than refusing it: there is no 429 path left for this to reach.
 */

/** 2026-08-12 21:00 UTC = 2026-08-13 01:00 in Yerevan — a different calendar day */
const LATE_UTC = new Date('2026-08-12T21:00:00.000Z')
/** The same instant minus two hours: still 2026-08-12 in Yerevan */
const EARLIER_UTC = new Date('2026-08-12T19:00:00.000Z')

describe('the day boundary', () => {
  it('uses Armenia time, not the server clock', () => {
    // The VPS runs UTC. If this ever answers with the UTC day, every daily
    // limit in the app silently resets at 04:00 Yerevan time.
    expect(armeniaDateKey(LATE_UTC)).toBe('2026-08-13')
    expect(armeniaDateKey(EARLIER_UTC)).toBe('2026-08-12')
  })

  it('agrees with the analytics module, which resolves the same day separately', () => {
    // Two features count "per day" and must not disagree about when a day
    // starts. They share the timezone constant; this asserts the two date-key
    // functions built on it actually produce the same answer.
    expect(ANALYTICS_TIMEZONE).toBe(ARMENIA_TIMEZONE)
    for (const instant of [LATE_UTC, EARLIER_UTC, new Date('2026-01-01T00:30:00.000Z')]) {
      expect(armeniaDateKey(instant), instant.toISOString()).toBe(toAnalyticsDateKey(instant))
    }
  })
})

describe('the numbers', () => {
  it('leaves a safety margin under the real ORS quota rather than spending it exactly', () => {
    expect(NEAREST_ORS_DAILY_CALL_LIMIT).toBe(NEAREST_ORS_DAILY_QUOTA - NEAREST_ORS_DAILY_SAFETY_MARGIN)
    expect(NEAREST_ORS_DAILY_SAFETY_MARGIN).toBeGreaterThan(0)
  })
})

describe('counting calls', () => {
  it('allows exactly the daily limit, then refuses budget (not the visitor)', () => {
    const quota = new NearestQuotaService()

    for (let i = 0; i < NEAREST_ORS_DAILY_CALL_LIMIT; i += 1) {
      expect(quota.hasRemaining(), `call ${i + 1}`).toBe(true)
      quota.consume()
    }

    expect(quota.hasRemaining()).toBe(false)
  })

  it('is one counter for the whole platform, not one per caller', () => {
    // There is no address or identity parameter any more — every caller draws
    // from the same budget, which is the entire point of the change.
    const quota = new NearestQuotaService()

    for (let i = 0; i < NEAREST_ORS_DAILY_CALL_LIMIT; i += 1) quota.consume()

    expect(quota.hasRemaining()).toBe(false)
  })

  it('discards yesterday\'s count rather than carrying it forward', () => {
    const quota = new NearestQuotaService()

    for (let i = 0; i < NEAREST_ORS_DAILY_CALL_LIMIT; i += 1) quota.consume(EARLIER_UTC)
    expect(quota.hasRemaining(EARLIER_UTC)).toBe(false)

    // Two hours later on the clock, but a new calendar day in Yerevan.
    expect(quota.hasRemaining(LATE_UTC)).toBe(true)
  })

  it('resets the counter to zero when the day rolls over', () => {
    const quota = new NearestQuotaService()

    quota.consume(EARLIER_UTC)
    quota.consume(EARLIER_UTC)
    expect(quota.today).toBe(2)

    quota.hasRemaining(LATE_UTC)
    expect(quota.today).toBe(0)
  })
})

describe('what the search charges for, and what happens at the cap', () => {
  /**
   * A NearestService wired to a real cache and quota, and a repository/matrix
   * pair that record how often each was actually reached. Everything past
   * PostGIS is irrelevant here — these tests are about which requests cost a
   * slot of the ORS budget, and what a visitor sees once it is gone.
   */
  function buildService(candidates: Array<{ id: number }> = [{ id: 1 }]) {
    const findNearestCandidates = vi.fn(() =>
      Promise.resolve(
        candidates.map((c) => ({
          id: c.id,
          latitude: 40.18,
          longitude: 44.5,
          straightLineMeters: 500,
        })),
      ),
    )
    const repository = { findNearestCandidates }
    const towTrucksService = {
      getCardsByIds: vi.fn((ids: number[]) =>
        Promise.resolve(ids.map((id) => ({ id }))),
      ),
    }
    const matrixFn = vi.fn(() =>
      Promise.resolve([{ meters: 1000, seconds: 120 }]),
    )
    const routeMatrix = { matrix: matrixFn }
    const cache = new NearestCacheService()
    const quota = new NearestQuotaService()

    const service = new NearestService(
      repository as never,
      towTrucksService as never,
      routeMatrix as never,
      cache,
      quota,
    )

    return { service, quota, findNearestCandidates, matrixFn }
  }

  const YEREVAN = { latitude: 40.1792, longitude: 44.4991 } as const

  it('charges one budget slot per matrix call actually made', async () => {
    const { service, quota, matrixFn } = buildService()

    await service.findNearest(YEREVAN.latitude, YEREVAN.longitude)

    expect(matrixFn).toHaveBeenCalledOnce()
    expect(quota.today).toBe(1)
  })

  it('does not charge for a request served from the cache', async () => {
    // The budget exists to bound external routing cost, and a cache hit has
    // none. Charging for it would spend the shared budget on nothing.
    const { service, quota, findNearestCandidates, matrixFn } = buildService()

    await service.findNearest(YEREVAN.latitude, YEREVAN.longitude)
    // Same ~110 m square, so the same cache key.
    await service.findNearest(YEREVAN.latitude + 0.00001, YEREVAN.longitude)

    expect(findNearestCandidates).toHaveBeenCalledOnce()
    expect(matrixFn).toHaveBeenCalledOnce()
    expect(quota.today).toBe(1)
  })

  it('skips the matrix call once the budget is spent, and still answers with a list', async () => {
    const { service, quota, matrixFn } = buildService()
    for (let i = 0; i < NEAREST_ORS_DAILY_CALL_LIMIT; i += 1) quota.consume()

    // A position far enough away to miss the earlier cache entry.
    const result = await service.findNearest(40.79, 43.84)

    expect(matrixFn).not.toHaveBeenCalled()
    expect(result.routed).toBe(false)
    expect(result.results).toHaveLength(1)
    // The visitor still gets a straight-line answer, not an error and not an
    // empty page — this is the whole point of "degrade, don't refuse".
    expect(result.results[0]!.straightLineMeters).toBe(500)
    expect(result.results[0]!.roadMeters).toBeUndefined()
  })

  it('never throws once the budget is spent — there is no 429 path any more', async () => {
    const { service, quota } = buildService()
    for (let i = 0; i < NEAREST_ORS_DAILY_CALL_LIMIT; i += 1) quota.consume()

    await expect(service.findNearest(40.79, 43.84)).resolves.toBeDefined()
  })

  it('still serves a cached routed answer to a search made after the budget ran out', async () => {
    // Deliberate: the cached response costs nothing upstream, so it is served
    // exactly as before regardless of today's remaining budget.
    const { service, quota } = buildService()

    await service.findNearest(YEREVAN.latitude, YEREVAN.longitude)
    while (quota.hasRemaining()) quota.consume()

    const result = await service.findNearest(YEREVAN.latitude, YEREVAN.longitude)
    expect(result.routed).toBe(true)
  })

  it('does not charge when the search fails before reaching the matrix call', async () => {
    const { service, quota, findNearestCandidates } = buildService()
    findNearestCandidates.mockRejectedValueOnce(new Error('PostGIS is down'))

    await service.findNearest(YEREVAN.latitude, YEREVAN.longitude).catch(() => undefined)

    expect(quota.today).toBe(0)
  })
})

describe('skipRouting — the answer a visitor gets past their daily allowance', () => {
  /**
   * The visitor-facing allowance (2/day, per browser) buys *road data*, not
   * the search. Past it the frontend keeps searching with `skipRouting`, and
   * the properties below are what make that free rather than merely cheaper.
   */
  function buildService() {
    const findNearestCandidates = vi.fn(() =>
      Promise.resolve([
        { id: 1, latitude: 40.18, longitude: 44.5, straightLineMeters: 500 },
      ]),
    )
    const towTrucksService = {
      getCardsByIds: vi.fn((ids: number[]) => Promise.resolve(ids.map((id) => ({ id })))),
    }
    const matrixFn = vi.fn(() => Promise.resolve([{ meters: 1000, seconds: 120 }]))
    const cache = new NearestCacheService()
    const quota = new NearestQuotaService()

    const service = new NearestService(
      { findNearestCandidates } as never,
      towTrucksService as never,
      { matrix: matrixFn } as never,
      cache,
      quota,
    )

    return { service, quota, cache, findNearestCandidates, matrixFn }
  }

  const YEREVAN = { latitude: 40.1792, longitude: 44.4991 } as const

  it('still returns the nearest drivers, just without road figures', async () => {
    // The whole point of the change: someone out of detailed searches is not
    // out of answers. An empty page for the person standing next to a broken
    // car is the outcome this test exists to prevent.
    const { service } = buildService()

    const result = await service.findNearest(YEREVAN.latitude, YEREVAN.longitude, true)

    expect(result.results).toHaveLength(1)
    expect(result.routed).toBe(false)
    expect(result.results[0]!.straightLineMeters).toBe(500)
    expect(result.results[0]!.roadMeters).toBeUndefined()
  })

  it('never calls the routing service, and never spends the shared budget', async () => {
    const { service, quota, matrixFn } = buildService()

    await service.findNearest(YEREVAN.latitude, YEREVAN.longitude, true)

    expect(matrixFn).not.toHaveBeenCalled()
    // Free is the reason it can be unlimited. If this ever charges, "unlimited
    // straight-line searches" quietly becomes a way to drain the day's budget.
    expect(quota.today).toBe(0)
  })

  it('is unlimited — repeated straight-line searches cost nothing', async () => {
    const { service, quota, matrixFn } = buildService()

    for (let i = 0; i < 50; i += 1) {
      // Different positions each time, so nothing is answered from the cache.
      await service.findNearest(40.1 + i * 0.01, 44.4, true)
    }

    expect(matrixFn).not.toHaveBeenCalled()
    expect(quota.today).toBe(0)
  })

  it('does not let a straight-line answer be served to a routed request', async () => {
    // The cache-poisoning bug this guards against: one visitor past their
    // allowance warms the cache for a whole ~110 m square, and everyone else
    // there silently loses road distances for five minutes despite having
    // allowance to spend.
    const { service, matrixFn } = buildService()

    await service.findNearest(YEREVAN.latitude, YEREVAN.longitude, true)
    const routed = await service.findNearest(YEREVAN.latitude, YEREVAN.longitude, false)

    expect(matrixFn).toHaveBeenCalledOnce()
    expect(routed.routed).toBe(true)
  })

  it('does serve an existing routed answer to a straight-line request', async () => {
    // The other direction is fine and deliberate: a routed answer is strictly
    // better and costs nothing to hand over, so withholding it would be
    // punishing someone for having asked for less.
    const { service, matrixFn } = buildService()

    await service.findNearest(YEREVAN.latitude, YEREVAN.longitude, false)
    const second = await service.findNearest(YEREVAN.latitude, YEREVAN.longitude, true)

    expect(matrixFn).toHaveBeenCalledOnce()
    expect(second.routed).toBe(true)
  })

  it('defaults to a full routed search when the flag is absent', async () => {
    // The parameter is optional on the DTO. Defaulting the other way would
    // silently turn off road distances for every visitor at once.
    const { service, matrixFn } = buildService()

    const result = await service.findNearest(YEREVAN.latitude, YEREVAN.longitude)

    expect(matrixFn).toHaveBeenCalledOnce()
    expect(result.routed).toBe(true)
  })
})
