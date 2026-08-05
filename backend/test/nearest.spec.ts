import 'reflect-metadata'
import { RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NearestCacheService } from '../src/nearest/nearest-cache.service'
import {
  NEAREST_CANDIDATE_LIMIT,
  NEAREST_CACHE_KEY_PRECISION,
  NEAREST_CACHE_MAX_ENTRIES,
  NEAREST_RESULT_LIMIT,
} from '../src/nearest/nearest.constants'
import { NearestController } from '../src/nearest/nearest.controller'
import { RouteMatrixService } from '../src/nearest/route-matrix.service'
import type { NearestSearchApi } from '../src/nearest/nearest.types'

/**
 * The parts of the nearest-driver search that are decided in code rather than
 * by Postgres or by a remote service.
 *
 * The PostGIS query itself is deliberately NOT tested here — it needs a real
 * database with the extension installed, which `docs/testing.md` keeps out of
 * this suite on purpose. Its correctness is a documented manual check against
 * staging.
 */

const emptyResult: NearestSearchApi = { results: [], routed: false }

describe('nearest search constants', () => {
  /**
   * The prefilter must be strictly larger than the answer, and this is the
   * whole reason the routing step exists: straight-line order and road order
   * differ, so the road-nearest 10 can only be found by routing more than 10.
   * Setting them equal would make the matrix call a formatting step.
   */
  it('routes more candidates than it returns', () => {
    expect(NEAREST_CANDIDATE_LIMIT).toBeGreaterThan(NEAREST_RESULT_LIMIT)
  })

  it('returns at most 10 drivers', () => {
    expect(NEAREST_RESULT_LIMIT).toBe(10)
  })
})

describe('NearestCacheService', () => {
  let cache: NearestCacheService

  beforeEach(() => {
    cache = new NearestCacheService()
  })

  /**
   * The rounded key is the ONLY form in which a visitor's position exists on
   * the server — nothing reaches the database. Three decimals is ~110 m, so the
   * thing held in memory is a neighbourhood rather than a doorstep.
   */
  it('rounds coordinates to a neighbourhood, not a doorstep', () => {
    expect(cache.buildKey(40.1792341, 44.4991876)).toBe('40.179,44.499')
    expect(NEAREST_CACHE_KEY_PRECISION).toBe(3)
  })

  it('gives two visitors on the same street one cache entry', () => {
    expect(cache.buildKey(40.17921, 44.49912)).toBe(cache.buildKey(40.17924, 44.49918))
  })

  it('keeps visibly different positions apart', () => {
    expect(cache.buildKey(40.179, 44.499)).not.toBe(cache.buildKey(40.185, 44.499))
  })

  /**
   * Floating point on a coordinate that has been through JSON does not
   * guarantee that two arithmetically equal values produce the same string —
   * which is why the key is built with toFixed rather than multiply/round/divide.
   */
  it('produces a stable key for a value that has been through JSON', () => {
    const raw = 40.1792
    const round = JSON.parse(JSON.stringify({ v: raw })) as { v: number }
    expect(cache.buildKey(round.v, 44.4991)).toBe(cache.buildKey(raw, 44.4991))
  })

  it('stores and returns a value', () => {
    cache.set('k', emptyResult)
    expect(cache.get('k')).toEqual(emptyResult)
  })

  it('returns null for an unknown key', () => {
    expect(cache.get('missing')).toBeNull()
  })

  it('expires an entry once its TTL has passed', () => {
    vi.useFakeTimers()
    try {
      cache.set('k', emptyResult)
      expect(cache.get('k')).not.toBeNull()

      // Just past the 5-minute TTL
      vi.advanceTimersByTime(5 * 60 * 1000 + 1)
      expect(cache.get('k')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  /**
   * A cache is otherwise an unbounded write primitive exposed to anonymous
   * callers: a script walking coordinates in 110 m steps would insert an entry
   * per step until the process died.
   */
  it('stays bounded no matter how many distinct positions are inserted', () => {
    for (let i = 0; i < NEAREST_CACHE_MAX_ENTRIES * 2; i += 1) {
      cache.set(`key-${i}`, emptyResult)
    }
    expect(cache.size).toBeLessThanOrEqual(NEAREST_CACHE_MAX_ENTRIES)
  })

  it('evicts the oldest insertion first, keeping the newest reachable', () => {
    for (let i = 0; i < NEAREST_CACHE_MAX_ENTRIES + 5; i += 1) {
      cache.set(`key-${i}`, emptyResult)
    }
    expect(cache.get('key-0')).toBeNull()
    expect(cache.get(`key-${NEAREST_CACHE_MAX_ENTRIES + 4}`)).not.toBeNull()
  })
})

describe('RouteMatrixService', () => {
  function build(apiKey: string): RouteMatrixService {
    const configService = {
      get: () => ({ apiKey, baseUrl: 'https://api.openrouteservice.org' }),
    } as unknown as ConstructorParameters<typeof RouteMatrixService>[0]
    return new RouteMatrixService(configService)
  }

  /**
   * An unset key must be a working deploy with a smaller answer, not a broken
   * one — the same "optional, off by default, no boot failure" shape the admin
   * Telegram bot has.
   */
  it('reports itself unconfigured with no key, and makes no request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const service = build('')

    expect(service.isConfigured).toBe(false)
    await expect(
      service.matrix({ latitude: 40.1, longitude: 44.5 }, [{ latitude: 40.2, longitude: 44.6 }]),
    ).resolves.toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
  })

  it('reports itself configured once a key is present', () => {
    expect(build('a-key').isConfigured).toBe(true)
  })

  it('makes no request for an empty destination list', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(build('a-key').matrix({ latitude: 40.1, longitude: 44.5 }, [])).resolves.toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  /**
   * Every failure returns null rather than throwing: an unreachable routing
   * service must degrade the page to straight-line distances, never break it.
   */
  it('returns null instead of throwing when the service answers with an error status', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('quota exceeded', { status: 429 }))

    await expect(
      build('a-key').matrix({ latitude: 40.1, longitude: 44.5 }, [
        { latitude: 40.2, longitude: 44.6 },
      ]),
    ).resolves.toBeNull()

    fetchSpy.mockRestore()
  })

  it('returns null instead of throwing when the request fails outright', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(
      build('a-key').matrix({ latitude: 40.1, longitude: 44.5 }, [
        { latitude: 40.2, longitude: 44.6 },
      ]),
    ).resolves.toBeNull()

    fetchSpy.mockRestore()
  })

  /**
   * Longitude before latitude, for ORS exactly as for PostGIS. Reversing it
   * produces plausible distances that are all wrong, which is precisely the
   * class of bug no amount of eyeballing the page catches.
   */
  it('sends [longitude, latitude] with the origin first', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ distances: [[1200]], durations: [[180]] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await build('a-key').matrix({ latitude: 40.1792, longitude: 44.4991 }, [
      { latitude: 40.2, longitude: 44.6 },
    ])

    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string) as {
      locations: number[][]
      sources: number[]
      destinations: number[]
    }
    expect(body.locations[0]).toEqual([44.4991, 40.1792])
    expect(body.locations[1]).toEqual([44.6, 40.2])
    expect(body.sources).toEqual([0])
    // Every index except the origin — asking for the full N×N matrix would
    // compute driver-to-driver distances nobody looks at.
    expect(body.destinations).toEqual([1])

    fetchSpy.mockRestore()
  })

  it('maps a successful response positionally', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ distances: [[1200, 3400]], durations: [[180, 420]] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await build('a-key').matrix({ latitude: 40.1, longitude: 44.5 }, [
      { latitude: 40.2, longitude: 44.6 },
      { latitude: 40.3, longitude: 44.7 },
    ])

    expect(result).toEqual([
      { meters: 1200, seconds: 180 },
      { meters: 3400, seconds: 420 },
    ])

    fetchSpy.mockRestore()
  })

  /**
   * ORS returns null for a destination it cannot route to. That is a real
   * per-driver answer, not a failure of the request — so the others still get
   * their road figures and only the unroutable one falls back.
   */
  it('maps an unroutable destination to null without discarding the rest', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ distances: [[1200, null]], durations: [[180, null]] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await build('a-key').matrix({ latitude: 40.1, longitude: 44.5 }, [
      { latitude: 40.2, longitude: 44.6 },
      { latitude: 41.9, longitude: 46.9 },
    ])

    expect(result).toEqual([{ meters: 1200, seconds: 180 }, null])

    fetchSpy.mockRestore()
  })

  /**
   * Both or neither. A road distance next to a missing time on one card only
   * reads as a rendering bug rather than as missing data.
   */
  it('drops a destination that has a distance but no duration', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ distances: [[1200]], durations: [[null]] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await build('a-key').matrix({ latitude: 40.1, longitude: 44.5 }, [
      { latitude: 40.2, longitude: 44.6 },
    ])

    expect(result).toEqual([null])

    fetchSpy.mockRestore()
  })
})

describe('NearestController route', () => {
  const handler = (NearestController.prototype as unknown as Record<string, () => unknown>)
    .findNearest!

  it('is a POST, so the visitor position never reaches nginx access logs', () => {
    expect(Reflect.getMetadata(PATH_METADATA, NearestController)).toBe('nearest-tow-trucks')
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST)
  })

  /**
   * Stricter than the global 60/60s because a cache miss costs an external
   * matrix request against a metered daily quota.
   */
  it('carries a throttle override stricter than the global default', () => {
    const limit = Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler) as number
    const ttl = Reflect.getMetadata(`${THROTTLER_TTL}default`, handler) as number

    expect(limit).toBeLessThan(60)
    expect(ttl).toBe(60_000)
  })
})
