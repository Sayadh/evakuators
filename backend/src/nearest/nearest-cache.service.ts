import { Injectable } from '@nestjs/common'
import {
  NEAREST_CACHE_KEY_PRECISION,
  NEAREST_CACHE_MAX_ENTRIES,
  NEAREST_CACHE_TTL_MS,
} from './nearest.constants'
import type { NearestSearchApi } from './nearest.types'

/**
 * A five-minute, in-memory cache for search results.
 *
 * ## Why in-memory and not Redis
 *
 * The same call `docs/analytics.md` § Caching makes: one PM2 instance
 * (`instances: 1` is already load-bearing for the cron jobs), so a process-local
 * Map is a real cache and not a partial one. Introducing Redis for this alone
 * would add a service to run, monitor and back up in exchange for nothing that
 * is true today.
 *
 * ## The key is a neighbourhood, not a person
 *
 * Coordinates are rounded to 3 decimal places (~110 m) before they become a key.
 * That is what makes the cache useful — two visitors on the same street share an
 * entry, so a burst of nearby searches costs one upstream matrix request — and
 * it is also the privacy boundary: **this rounded string is the only form in
 * which a visitor's position exists anywhere on the server.** Nothing here is
 * written to the database, nothing is logged, and every entry evaporates on TTL
 * expiry or process restart, whichever comes first.
 *
 * ## Why a size cap
 *
 * Without one, a script walking coordinates in 110 m steps would insert an entry
 * per step and grow the heap until the process died — a cache is otherwise an
 * unbounded write primitive exposed to anonymous callers. The eviction below is
 * deliberately the crudest thing that cannot be wrong: when the cap is hit,
 * expired entries go first, and if that was not enough the oldest insertions go
 * too. Not LRU — tracking access order would buy a better hit rate on a cache
 * whose entries live five minutes and whose miss costs one HTTP request.
 */
interface CacheEntry {
  value: NearestSearchApi
  expiresAt: number
}

@Injectable()
export class NearestCacheService {
  // Insertion-ordered by specification, which is what makes "delete the oldest"
  // below a `keys().next()` rather than a sort.
  private readonly entries = new Map<string, CacheEntry>()

  /**
   * `40.1792, 44.4991` → `"40.179,44.499"`, or `"40.179,44.499|nr"` for an
   * answer that was deliberately computed without routing.
   *
   * `toFixed` rather than a multiply-round-divide: it produces the same string
   * for `40.1792` and `40.17920000000001`, which floating-point arithmetic on a
   * coordinate that has been through JSON does not guarantee.
   *
   * ## Why the routing intent is part of the key
   *
   * The two answers are not interchangeable in both directions. A routed one
   * is strictly better and can be served to anyone (the caller checks for it
   * first, see `NearestService`), but a straight-line-only one must never be
   * handed to a visitor who still has allowance to spend on road distances —
   * they would silently get the degraded page and no way to ask again for five
   * minutes. Separating them at the key is what makes that impossible rather
   * than merely unlikely.
   */
  buildKey(latitude: number, longitude: number, routed = true): string {
    const position = `${latitude.toFixed(NEAREST_CACHE_KEY_PRECISION)},${longitude.toFixed(NEAREST_CACHE_KEY_PRECISION)}`
    return routed ? position : `${position}|nr`
  }

  get(key: string): NearestSearchApi | null {
    const entry = this.entries.get(key)
    if (!entry) return null

    // Checked on read rather than swept on a timer: an expired entry that is
    // never read again costs nothing until the size cap collects it, and a timer
    // would be a fourth cron job to reason about.
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return null
    }
    return entry.value
  }

  set(key: string, value: NearestSearchApi): void {
    this.evictIfFull()
    this.entries.set(key, { value, expiresAt: Date.now() + NEAREST_CACHE_TTL_MS })
  }

  /** Test seam — the cache is process-global, so a suite needs a way to start clean */
  clear(): void {
    this.entries.clear()
  }

  get size(): number {
    return this.entries.size
  }

  private evictIfFull(): void {
    if (this.entries.size < NEAREST_CACHE_MAX_ENTRIES) return

    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key)
    }

    // Still full — every entry is live, so age is the only thing left to go on.
    while (this.entries.size >= NEAREST_CACHE_MAX_ENTRIES) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
  }
}
