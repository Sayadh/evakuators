import { Injectable, Logger } from '@nestjs/common'
import { armeniaDateKey } from '../common/armenia-day'
import {
  NEAREST_DAILY_IP_SEARCH_LIMIT,
  NEAREST_QUOTA_MAX_ENTRIES,
} from './nearest.constants'

/**
 * How many searches one IP has actually performed today — the daily ceiling
 * that sits behind the per-minute throttle.
 *
 * ## What this is, and what it is not
 *
 * It is an **abuse ceiling on a metered external quota**, not the visitor's
 * "2 searches per day". That rule is per *person* and lives in the browser
 * (`frontend/constants/nearest.ts`), because an IP is not a person — see
 * `NEAREST_DAILY_IP_SEARCH_LIMIT` for the CGNAT argument and why the two
 * numbers are deliberately far apart. Anyone reading this class as "the daily
 * limit" and lowering it to 2 will take the feature away from every mobile
 * user sharing a carrier address.
 *
 * ## Counted on work done, not on requests received
 *
 * `consume()` is called only when a search actually runs — after the result
 * cache has missed. A request served from the five-minute cache costs no
 * external call, so charging for it would refuse a visitor a free answer. The
 * consequence, stated so it is a decision rather than a surprise: someone
 * repeatedly searching from the same ~110 m square can exceed this number in
 * requests while never exceeding it in upstream cost, which is exactly the
 * behaviour wanted from a quota that exists to protect that cost.
 *
 * ## In-memory, and the day is the eviction policy
 *
 * Same call as `NearestCacheService` and the analytics module: one PM2
 * instance (`instances: 1` is already load-bearing for the cron jobs), so a
 * process-local Map is a real counter and not a partial one. Restarting the
 * API resets every counter — acceptable for a ceiling whose job is to blunt
 * sustained abuse, not to be an accounting record, and deploys are rare
 * compared to a day.
 *
 * Stale rows are dropped when the day key changes rather than on a timer: the
 * whole table is invalid at midnight anyway, which makes "purge" a comparison
 * instead of a fourth cron job.
 */
interface QuotaEntry {
  /** Armenia calendar day this count belongs to — a count without one is meaningless */
  dateKey: string
  count: number
}

@Injectable()
export class NearestQuotaService {
  private readonly logger = new Logger(NearestQuotaService.name)
  private readonly entries = new Map<string, QuotaEntry>()
  /** The day every entry in the map belongs to; a change wipes the table */
  private currentDateKey = ''

  /**
   * Has this address got a search left today?
   *
   * Read-only — call `consume()` separately, and only once the search has
   * actually been performed. Splitting the two is what lets a cache hit be
   * free: the caller checks before doing work and charges after doing it, so
   * a request that did no work is never charged for.
   */
  hasRemaining(ip: string, now: Date = new Date()): boolean {
    this.rolloverIfNewDay(now)
    return (this.entries.get(ip)?.count ?? 0) < NEAREST_DAILY_IP_SEARCH_LIMIT
  }

  /** Records one performed search against this address */
  consume(ip: string, now: Date = new Date()): void {
    this.rolloverIfNewDay(now)

    const existing = this.entries.get(ip)
    if (existing) {
      existing.count += 1
      return
    }

    this.evictIfFull()
    this.entries.set(ip, { dateKey: this.currentDateKey, count: 1 })
  }

  /** Test seam — the counter is process-global, so a suite needs a way to start clean */
  clear(): void {
    this.entries.clear()
    this.currentDateKey = ''
  }

  get size(): number {
    return this.entries.size
  }

  /**
   * Midnight in Armenia invalidates every count at once, so the cheapest
   * correct purge is to notice the day changed and drop the table. No entry
   * can outlive its day, which is also why `QuotaEntry.dateKey` is never read
   * for comparison — it exists so a row is self-describing in a heap dump.
   */
  private rolloverIfNewDay(now: Date): void {
    const today = armeniaDateKey(now)
    if (today === this.currentDateKey) return

    this.entries.clear()
    this.currentDateKey = today
  }

  /**
   * The cap can only be hit by a flood of distinct addresses inside one day.
   * Dropping the whole table is deliberate rather than evicting the oldest
   * entries: partial eviction under a spoofed-address flood evicts exactly the
   * genuine users (whose entries are oldest) and keeps the attacker's, which
   * inverts what the cap is for. A full reset gives everyone their allowance
   * back, which is the safe direction to fail in for a ceiling that is not an
   * accounting record.
   */
  private evictIfFull(): void {
    if (this.entries.size < NEAREST_QUOTA_MAX_ENTRIES) return

    this.logger.warn(
      `Nearest-search quota table hit ${NEAREST_QUOTA_MAX_ENTRIES} addresses in one day — resetting. ` +
        'If this appears regularly it is worth looking at the traffic before raising the cap.',
    )
    this.entries.clear()
  }
}
