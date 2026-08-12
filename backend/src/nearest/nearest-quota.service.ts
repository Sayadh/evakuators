import { Injectable, Logger } from '@nestjs/common'
import { armeniaDateKey } from '../common/armenia-day'
import { NEAREST_ORS_DAILY_CALL_LIMIT } from './nearest.constants'

/**
 * How many OpenRouteService matrix calls this app has made today, against the
 * real daily cap on the ORS key in use.
 *
 * ## What this replaced
 *
 * An earlier version tracked a per-IP daily ceiling (40/address). It was
 * removed: `req.ip` is not the thing that runs out — the platform's ONE
 * shared ORS budget is — and a per-IP cap set low enough to bite still let a
 * modest number of distinct addresses collectively blow through that shared
 * budget, while a per-IP cap set high enough not to bite protected nothing.
 * This counts the quantity that actually needs protecting: total matrix
 * calls made today, platform-wide. See `NEAREST_ORS_DAILY_QUOTA` and
 * docs/nearest-search.md.
 *
 * ## What happens at the cap: nothing is refused
 *
 * `NearestService` treats "no budget left" exactly like "the matrix call
 * failed" — it skips the call and serves straight-line distances,
 * `routed: false`, the same page state a visitor already sees whenever ORS
 * is unreachable. There is no 429 for this and never was one for a visitor
 * to hit: running out of a shared daily budget is not any one person's doing.
 *
 * ## Counted on attempts, not successes
 *
 * `consume()` is called once per matrix call this app is about to make,
 * before the network request goes out. A call that times out or gets back a
 * 5xx still used up a slot against ORS's own real daily counter, so waiting
 * to see whether the call succeeded before counting it would let the app keep
 * trying past the point ORS has already cut it off.
 *
 * ## In-memory, day is the eviction policy
 *
 * Same shape as `NearestCacheService` and the analytics module: one PM2
 * instance (`instances: 1`), so a process-local counter is a real one, not a
 * partial one. A restart resets it to zero, which is the safe direction to be
 * wrong in — fewer calls will actually have been made than a fresh counter
 * claims, never more.
 */
@Injectable()
export class NearestQuotaService {
  private readonly logger = new Logger(NearestQuotaService.name)
  private currentDateKey = ''
  private callsToday = 0

  /**
   * Is there budget left to make one more matrix call today?
   *
   * Read-only — call `consume()` separately, and only right before the call
   * it corresponds to actually goes out.
   */
  hasRemaining(now: Date = new Date()): boolean {
    this.rolloverIfNewDay(now)
    return this.callsToday < NEAREST_ORS_DAILY_CALL_LIMIT
  }

  /** Records one matrix call attempt against today's budget. */
  consume(now: Date = new Date()): void {
    this.rolloverIfNewDay(now)
    this.callsToday += 1

    if (this.callsToday === NEAREST_ORS_DAILY_CALL_LIMIT) {
      this.logger.warn(
        `Nearest-search ORS budget reached (${NEAREST_ORS_DAILY_CALL_LIMIT}/day) — ` +
          'remaining searches today will fall back to straight-line distances.',
      )
    }
  }

  /** Test seam — the counter is process-global, so a suite needs a way to start clean */
  clear(): void {
    this.callsToday = 0
    this.currentDateKey = ''
  }

  /** How many calls have been made today, for the admin panel or a health check */
  get today(): number {
    return this.callsToday
  }

  /**
   * Midnight in Armenia invalidates the count, so the cheapest correct purge
   * is to notice the day changed and zero it — no timer, no fourth cron job.
   */
  private rolloverIfNewDay(now: Date): void {
    const today = armeniaDateKey(now)
    if (today === this.currentDateKey) return

    this.currentDateKey = today
    this.callsToday = 0
  }
}
