import { Injectable } from '@nestjs/common'
import { ANALYTICS_PERIOD_DAYS } from './analytics.constants'
import type { AnalyticsPeriod } from './analytics.enums'
import type { AnalyticsRangeApi } from './analytics.types'
import {
  AnalyticsDateKey,
  shiftDateKey,
  toAnalyticsDateKey,
} from './analytics.utils'

/**
 * The single place in the module that reads the system clock.
 *
 * Everything else — the factory, both services, the repository — receives
 * already-resolved date keys. That is deliberate: "which calendar day is it in
 * Armenia right now" is the one question this feature must never get wrong, and
 * concentrating it behind an injectable makes it (a) impossible to accidentally
 * bypass with a stray `new Date()`, and (b) trivially stubbable in tests
 * ("what happens at 23:59 Yerevan time?" is a unit test, not a manual
 * midnight vigil).
 */
@Injectable()
export class AnalyticsClock {
  /** The Armenia calendar day that is in progress right now */
  today(): AnalyticsDateKey {
    return toAnalyticsDateKey(this.now())
  }

  /**
   * Resolves a period enum into a concrete inclusive window ending today.
   * `LAST_7_DAYS` means today plus the six days before it — not "168 hours
   * ago", which would put a partial day at both ends of every chart.
   */
  resolveRange(period: AnalyticsPeriod): AnalyticsRangeApi {
    const days = ANALYTICS_PERIOD_DAYS[period]
    const to = this.today()
    return { period, from: shiftDateKey(to, -(days - 1)), to, days }
  }

  /** Oldest day the visitor-dedup ledger keeps, as a Postgres-comparable Date */
  retentionCutoff(retentionDays: number): AnalyticsDateKey {
    return shiftDateKey(this.today(), -retentionDays)
  }

  /** Wrapped so tests can override just this one method */
  protected now(): Date {
    return new Date()
  }
}
