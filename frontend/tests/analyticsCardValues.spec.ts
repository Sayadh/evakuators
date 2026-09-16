import { describe, expect, it } from 'vitest'
import { ANALYTICS_OVERVIEW_CARDS } from '~/constants/analytics'
import type { AnalyticsOverview } from '~/types/analytics'
import { AnalyticsEventType } from '~/types/enums'
import { cardAllTimeValue, cardPeriodValue } from '~/utils/analyticsCardValues'

const zeroTotals = {
  [AnalyticsEventType.PageView]: 0,
  [AnalyticsEventType.PhoneClick]: 0,
  [AnalyticsEventType.WhatsAppClick]: 0,
  [AnalyticsEventType.TelegramClick]: 0,
  [AnalyticsEventType.EmailClick]: 0,
}

function overview(patch: Partial<AnalyticsOverview> = {}): AnalyticsOverview {
  return {
    range: { period: 'LAST_30_DAYS', from: '2026-08-18', to: '2026-09-16', days: 30 },
    totals: { ...zeroTotals, [AnalyticsEventType.PageView]: 12 },
    uniqueVisitors: 7,
    allTimeTotals: { ...zeroTotals, [AnalyticsEventType.PageView]: 300 },
    reviews: { confirmed: 0, pending: 0, total: 0 },
    ratings: { confirmed: 0, pending: 0, confirmedAverage: null, pendingAverage: null },
    dispatches: { period: 3, allTime: 41 },
    ...patch,
  } as AnalyticsOverview
}

const cardFor = (kind: string) => {
  const card = ANALYTICS_OVERVIEW_CARDS.find((c) => c.source.kind === kind)
  if (!card) throw new Error(`no card with source kind ${kind}`)
  return card
}

describe('overview card values', () => {
  it('reads a per-event card from totals and allTimeTotals', () => {
    const card = ANALYTICS_OVERVIEW_CARDS.find(
      (c) => c.source.kind === 'event' && c.source.eventType === AnalyticsEventType.PageView,
    )!

    expect(cardPeriodValue(card, overview())).toBe(12)
    expect(cardAllTimeValue(card, overview())).toBe(300)
  })

  it('reads unique visitors from its own field, and has no lifetime figure', () => {
    const card = cardFor('uniqueVisitors')

    expect(cardPeriodValue(card, overview())).toBe(7)
    // Null, not 0: the ledger behind it is purged, so a lifetime number would
    // shrink over time — see docs/analytics.md.
    expect(cardAllTimeValue(card, overview())).toBeNull()
  })

  it('reads referrals from the dispatches counters', () => {
    const card = cardFor('dispatches')

    expect(cardPeriodValue(card, overview())).toBe(3)
    expect(cardAllTimeValue(card, overview())).toBe(41)
  })

  /**
   * The regression this file exists for.
   *
   * `dispatches` arrived after the other counters, and frontend and backend do
   * not restart at the same instant: every deploy has a window where this build
   * is live and the API response has no such field, and so does any dev machine
   * whose backend has not been restarted. Reading straight through it threw a
   * TypeError inside a render, which did not break one card — it took the whole
   * driver dashboard down with it.
   */
  it('does not throw when the API response predates the dispatches field', () => {
    const old = overview({ dispatches: undefined })

    for (const card of ANALYTICS_OVERVIEW_CARDS) {
      expect(() => cardPeriodValue(card, old), `period value for ${card.id}`).not.toThrow()
      expect(() => cardAllTimeValue(card, old), `all-time value for ${card.id}`).not.toThrow()
    }

    expect(cardPeriodValue(cardFor('dispatches'), old)).toBe(0)
    expect(cardAllTimeValue(cardFor('dispatches'), old)).toBe(0)
  })

  it('still reads every other card correctly from such a response', () => {
    const old = overview({ dispatches: undefined })

    expect(cardPeriodValue(cardFor('uniqueVisitors'), old)).toBe(7)
  })
})
