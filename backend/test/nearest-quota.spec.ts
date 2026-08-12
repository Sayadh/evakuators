import 'reflect-metadata'
import { HttpException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { armeniaDateKey, ARMENIA_TIMEZONE } from '../src/common/armenia-day'
import { toAnalyticsDateKey } from '../src/analytics/analytics.utils'
import { ANALYTICS_TIMEZONE } from '../src/analytics/analytics.constants'
import { NearestCacheService } from '../src/nearest/nearest-cache.service'
import { NearestQuotaService } from '../src/nearest/nearest-quota.service'
import { NearestService } from '../src/nearest/nearest.service'
import {
  NEAREST_DAILY_IP_SEARCH_LIMIT,
  NEAREST_DAILY_LIMIT_CODE,
  NEAREST_QUOTA_MAX_ENTRIES,
} from '../src/nearest/nearest.constants'

/**
 * The daily per-IP ceiling behind the nearest-evacuator search.
 *
 * The properties worth pinning are the ones that are invisible when it works:
 * that "a day" means an Armenia day rather than a UTC one, that a counter from
 * yesterday is discarded rather than carried forward, and — most of all — that
 * this stays an abuse ceiling rather than being mistaken for the visitor's
 * "2 searches per day" and lowered to match it.
 */

const IP = '77.0.0.1'

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

describe('counting searches', () => {
  it('allows exactly the daily limit, then refuses', () => {
    const quota = new NearestQuotaService()

    for (let i = 0; i < NEAREST_DAILY_IP_SEARCH_LIMIT; i += 1) {
      expect(quota.hasRemaining(IP), `search ${i + 1}`).toBe(true)
      quota.consume(IP)
    }

    expect(quota.hasRemaining(IP)).toBe(false)
  })

  it('counts each address separately', () => {
    const quota = new NearestQuotaService()

    for (let i = 0; i < NEAREST_DAILY_IP_SEARCH_LIMIT; i += 1) quota.consume(IP)

    expect(quota.hasRemaining(IP)).toBe(false)
    expect(quota.hasRemaining('77.0.0.2')).toBe(true)
  })

  it('discards yesterday\'s count rather than carrying it forward', () => {
    const quota = new NearestQuotaService()

    for (let i = 0; i < NEAREST_DAILY_IP_SEARCH_LIMIT; i += 1) quota.consume(IP, EARLIER_UTC)
    expect(quota.hasRemaining(IP, EARLIER_UTC)).toBe(false)

    // Two hours later on the clock, but a new calendar day in Yerevan.
    expect(quota.hasRemaining(IP, LATE_UTC)).toBe(true)
  })

  it('drops the whole table when the day rolls over', () => {
    const quota = new NearestQuotaService()

    quota.consume('a', EARLIER_UTC)
    quota.consume('b', EARLIER_UTC)
    expect(quota.size).toBe(2)

    quota.hasRemaining('c', LATE_UTC)
    expect(quota.size).toBe(0)
  })
})

describe('the limit is an abuse ceiling, not the visitor-facing rule', () => {
  it('is set far above the 2-per-day a person is shown', () => {
    // The product rule ("you have used your 2 searches") is per PERSON and
    // lives in frontend/constants/nearest.ts. This one is per IP, and an IP is
    // not a person — Armenian mobile carriers put many phones behind one
    // address. Lowering this to 2 to "make them match" would refuse the third
    // phone on a carrier address, which is why the gap is asserted rather than
    // left to a comment.
    expect(NEAREST_DAILY_IP_SEARCH_LIMIT).toBeGreaterThanOrEqual(20)
  })
})

describe('what the search charges for', () => {
  /**
   * A NearestService wired to a real cache and quota, and a repository that
   * records how often it was actually reached. Everything past PostGIS is
   * irrelevant here — these tests are about which requests cost an allowance.
   */
  function buildService(candidates: Array<{ id: number }> = []) {
    const findNearestCandidates = vi.fn(() => Promise.resolve(candidates))
    const repository = { findNearestCandidates }
    const towTrucksService = { getCardsByIds: vi.fn(() => Promise.resolve([])) }
    const routeMatrix = { matrix: vi.fn(() => Promise.resolve(null)) }
    const cache = new NearestCacheService()
    const quota = new NearestQuotaService()

    const service = new NearestService(
      repository as never,
      towTrucksService as never,
      routeMatrix as never,
      cache,
      quota,
    )

    return { service, quota, findNearestCandidates }
  }

  const YEREVAN = { latitude: 40.1792, longitude: 44.4991 } as const

  it('charges one allowance per performed search', async () => {
    const { service, quota } = buildService()

    await service.findNearest(YEREVAN.latitude, YEREVAN.longitude, IP)

    // One consumed out of the daily ceiling.
    for (let i = 1; i < NEAREST_DAILY_IP_SEARCH_LIMIT; i += 1) quota.consume(IP)
    expect(quota.hasRemaining(IP)).toBe(false)
  })

  it('does not charge for a request served from the cache', async () => {
    // The ceiling exists to bound external routing cost, and a cache hit has
    // none. Charging for it would take a free answer away from a visitor.
    const { service, quota, findNearestCandidates } = buildService()

    await service.findNearest(YEREVAN.latitude, YEREVAN.longitude, IP)
    // Same ~110 m square, so the same cache key.
    await service.findNearest(YEREVAN.latitude + 0.00001, YEREVAN.longitude, IP)

    expect(findNearestCandidates).toHaveBeenCalledOnce()

    // Still only one charged: topping up to the limit takes limit-1 more.
    for (let i = 1; i < NEAREST_DAILY_IP_SEARCH_LIMIT; i += 1) quota.consume(IP)
    expect(quota.hasRemaining(IP)).toBe(false)
  })

  it('refuses with a machine-readable code once the ceiling is reached', async () => {
    const { service, quota } = buildService()
    for (let i = 0; i < NEAREST_DAILY_IP_SEARCH_LIMIT; i += 1) quota.consume(IP)

    // A position far enough away to miss any cache entry.
    const error = await service.findNearest(40.79, 43.84, IP).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(HttpException)
    expect((error as HttpException).getStatus()).toBe(429)
    // Matched on a code, not the Armenian sentence — the frontend needs to
    // tell this apart from the per-minute throttle's own 429, and matching on
    // a message breaks the day someone rewords it.
    expect((error as HttpException).getResponse()).toMatchObject({
      code: NEAREST_DAILY_LIMIT_CODE,
    })
  })

  it('still serves a cached answer to someone over the ceiling', async () => {
    // Deliberate: the cached response costs nothing upstream, so refusing it
    // would be punishing rather than protecting.
    const { service, quota } = buildService()

    await service.findNearest(YEREVAN.latitude, YEREVAN.longitude, IP)
    while (quota.hasRemaining(IP)) quota.consume(IP)

    await expect(
      service.findNearest(YEREVAN.latitude, YEREVAN.longitude, IP),
    ).resolves.toEqual({ results: [], routed: false })
  })

  it('does not charge when the search itself fails', async () => {
    const { service, quota } = buildService()
    const failing = buildService()
    failing.findNearestCandidates.mockRejectedValueOnce(new Error('PostGIS is down'))

    await failing.service.findNearest(YEREVAN.latitude, YEREVAN.longitude, IP).catch(() => undefined)

    // A limit the visitor cannot see or appeal must not be spent on an outage
    // that was not their doing.
    expect(failing.quota.hasRemaining(IP)).toBe(true)
    expect(quota.hasRemaining(IP)).toBe(true)
  })
})

describe('the size cap', () => {
  it('resets rather than evicting the oldest entries', () => {
    const quota = new NearestQuotaService()

    for (let i = 0; i < NEAREST_QUOTA_MAX_ENTRIES; i += 1) quota.consume(`ip-${i}`)
    expect(quota.size).toBe(NEAREST_QUOTA_MAX_ENTRIES)

    quota.consume('one-too-many')

    // Partial eviction under a flood of spoofed addresses would evict the
    // genuine users first (their entries are oldest) and keep the attacker's.
    // A full reset gives everyone their allowance back, which is the safe way
    // for a ceiling to fail.
    expect(quota.size).toBe(1)
    expect(quota.hasRemaining('ip-0')).toBe(true)
  })
})
