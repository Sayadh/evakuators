import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ANALYTICS_CHART_METRICS, ANALYTICS_OVERVIEW_CARDS } from '~/constants/analytics'
import { AnalyticsEventType } from '~/types/enums'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const tracking = readFileSync(`${ROOT}composables/useAnalyticsTracking.ts`, 'utf8')

/**
 * A metric may only be shown to a driver if something in the app can still
 * produce it.
 *
 * `EMAIL_CLICK` is the case that motivated this: the email address was removed
 * from the public profile, so the button that produced the event no longer
 * exists, but the dashboard kept an Email card and an Email chart line. Every
 * driver saw a permanently frozen number under the hint "how many visitors
 * pressed the Email button" — which reads as "nobody emails me" rather than
 * "this channel is gone". The arithmetic was right; the number was
 * unmeasurable, and presenting it was the bug.
 */
describe('no dashboard metric is surfaced that nothing can produce', () => {
  it('has no Email card', () => {
    expect(
      ANALYTICS_OVERVIEW_CARDS.some((card) => card.eventType === AnalyticsEventType.EmailClick),
    ).toBe(false)
  })

  it('has no Email chart line', () => {
    expect(
      ANALYTICS_CHART_METRICS.some(
        (metric) => metric.eventType === AnalyticsEventType.EmailClick,
      ),
    ).toBe(false)
  })

  it('confirms the reason: trackEmailClick has no caller outside its own definition', () => {
    // If an email contact button is ever reintroduced, this fails and the card
    // and chart line should come back with it — the assertion is the reminder.
    const callers = readFileSync(`${ROOT}composables/usePhoneActions.ts`, 'utf8')
    expect(callers).not.toContain('trackEmailClick')
    // Still exported and still valid — the event type is not being deleted,
    // only left unsurfaced while nothing produces it.
    expect(tracking).toContain('trackEmailClick')
  })
})

/**
 * Every counter card except the derived unique-visitors one is a sum of
 * per-day, per-visitor-deduplicated events. Someone who calls on three
 * different days counts three times. The hints must say so, because the
 * neighbouring card ("Եզակի այցելուներ") IS distinct people, and two adjacent
 * numbers that differ need to explain why or they read as a discrepancy.
 */
describe('the counter hints state the daily-dedup rule', () => {
  it('every per-event card explains it', () => {
    const counterCards = ANALYTICS_OVERVIEW_CARDS.filter((card) => card.eventType !== null)
    expect(counterCards.length).toBeGreaterThan(0)

    for (const card of counterCards) {
      expect(card.hint, `card ${card.id} hint`).toContain('օրական՝ մեկ այցելու = 1')
    }
  })

  it('the unique-visitors card does NOT, because it is not that metric', () => {
    const unique = ANALYTICS_OVERVIEW_CARDS.find((card) => card.eventType === null)
    expect(unique).toBeDefined()
    expect(unique?.hint).not.toContain('օրական՝ մեկ այցելու = 1')
  })
})
