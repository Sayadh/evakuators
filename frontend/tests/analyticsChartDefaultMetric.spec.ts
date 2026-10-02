import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ANALYTICS_CHART_DEFAULT_METRIC, ANALYTICS_CHART_METRICS } from '~/constants/analytics'
import { AnalyticsEventType } from '~/types/enums'

/**
 * The chart opens on «Զանգեր».
 *
 * A driver asks this page one question: did anybody ring me. Views answer how
 * many people looked and did not — worth knowing second, and a bad number to
 * be shown first because it is always the bigger one.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const chart = readFileSync(`${ROOT}components/analytics/AnalyticsChart.vue`, 'utf8')

describe('the daily chart leads with calls', () => {
  it('puts calls first in the tab row', () => {
    expect(ANALYTICS_CHART_METRICS[0]?.eventType).toBe(AnalyticsEventType.PhoneClick)
    expect(ANALYTICS_CHART_METRICS[1]?.eventType).toBe(AnalyticsEventType.PageView)
  })

  it('opens on that same tab', () => {
    expect(ANALYTICS_CHART_DEFAULT_METRIC).toBe(AnalyticsEventType.PhoneClick)
  })

  it('derives the open tab from the list rather than naming it twice', () => {
    // The failure this prevents is quiet: somebody reorders the tabs, the
    // chart still opens on whatever was hard-coded, and the selected tab is
    // no longer the leftmost one.
    expect(ANALYTICS_CHART_DEFAULT_METRIC).toBe(ANALYTICS_CHART_METRICS[0]?.eventType)
    expect(chart).toContain('ref<AnalyticsEventType>(ANALYTICS_CHART_DEFAULT_METRIC)')
    expect(chart).not.toContain('AnalyticsEventType.PageView')
  })
})
