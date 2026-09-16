import type { AnalyticsCardDefinition } from '~/constants/analytics'
import type { AnalyticsOverview } from '~/types/analytics'

/**
 * The two numbers an overview card shows, resolved from its declared source.
 *
 * ## Why these are pure functions in their own file
 *
 * Same reason `pixelContactSource.ts` is: this is a rule with edge cases that
 * deserves a direct test, and reaching it only through a mounted Vue component
 * would mean no test at all in a repo with no component runtime
 * (`docs/testing.md`). The component imports these and renders what they
 * return.
 *
 * ## The missing-field case, which is not hypothetical
 *
 * `dispatches` arrived after the other counters. A frontend build and the API
 * it talks to do not restart at the same instant, so there is always a window
 * in a deploy where this code is live and the response does not carry the
 * field yet — and the same thing happens on any dev machine whose backend has
 * not been restarted. Reading straight through it (`overview.dispatches.period`)
 * throws a TypeError inside a render, which does not break one card: it takes
 * down the whole dashboard around it. A counter that reads 0 until the API
 * catches up is the correct failure here, and it is what these return.
 */
export function cardPeriodValue(card: AnalyticsCardDefinition, overview: AnalyticsOverview): number {
  switch (card.source.kind) {
    case 'event':
      return overview.totals[card.source.eventType]
    case 'uniqueVisitors':
      return overview.uniqueVisitors
    case 'dispatches':
      return overview.dispatches?.period ?? 0
  }
}

/**
 * Lifetime value, or null where the metric has none.
 *
 * Unique visitors has none by design: the per-visitor ledger it is computed
 * from is purged on a retention schedule, so an "all-time unique visitors"
 * figure would quietly shrink over time, and showing nothing is more honest
 * than showing a number that decreases (see docs/analytics.md). Referrals do
 * have one — `DispatchReferral` rows are never purged.
 */
export function cardAllTimeValue(
  card: AnalyticsCardDefinition,
  overview: AnalyticsOverview,
): number | null {
  switch (card.source.kind) {
    case 'event':
      return overview.allTimeTotals[card.source.eventType]
    case 'uniqueVisitors':
      return null
    case 'dispatches':
      return overview.dispatches?.allTime ?? 0
  }
}
