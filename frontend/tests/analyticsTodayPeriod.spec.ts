import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ANALYTICS_PERIOD_LABELS, ANALYTICS_PERIOD_OPTIONS } from '~/constants/analytics'
import { AnalyticsPeriod } from '~/types/enums'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * `AnalyticsPeriod.Today` exists for exactly one screen — the admin's
 * site-wide panel — and must never reach a driver's own dashboard. Both
 * halves of that claim are pinned here: the shared switcher a driver sees
 * does not offer it, and the admin panel does.
 */
describe('the Today period is admin-only', () => {
  it('is not one of the driver dashboard’s selectable periods', () => {
    expect(ANALYTICS_PERIOD_OPTIONS.some((option) => option.value === AnalyticsPeriod.Today)).toBe(
      false,
    )
  })

  it('still has a label, for the admin panel that does offer it', () => {
    expect(ANALYTICS_PERIOD_LABELS[AnalyticsPeriod.Today]).toBe('Այսօր')
  })

  it('is offered, first, by the admin’s site-wide panel', () => {
    const panel = readFileSync(`${ROOT}components/admin/SiteAnalyticsPanel.vue`, 'utf8')
    const optionsBlock = panel.slice(
      panel.indexOf('const PERIOD_OPTIONS'),
      panel.indexOf(']', panel.indexOf('const PERIOD_OPTIONS')),
    )
    expect(optionsBlock.indexOf('AnalyticsPeriod.Today')).toBeGreaterThan(-1)
    expect(optionsBlock.indexOf('AnalyticsPeriod.Today')).toBeLessThan(
      optionsBlock.indexOf('AnalyticsPeriod.Last7Days'),
    )
  })

  it('the driver dashboard component never mentions it', () => {
    const dashboard = readFileSync(`${ROOT}components/analytics/AnalyticsDashboard.vue`, 'utf8')
    expect(dashboard).not.toContain('AnalyticsPeriod.Today')
  })
})
