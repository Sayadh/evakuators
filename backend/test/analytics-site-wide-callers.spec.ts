import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { AnalyticsRepository } from '../src/analytics/analytics.repository'
import { AnalyticsEventType } from '../src/analytics/analytics.enums'

/**
 * `countUniqueVisitorsSiteWide` / `sumEventTypeSiteWide` — the two queries
 * behind the admin panel's "Ակտիվ զանգողներ" (active callers) card.
 *
 * Per docs/analytics.md § "Verification performed", this module's raw-SQL
 * write path was checked against a real Postgres engine, not mocks — this
 * sandbox has no database to repeat that against for a new query. What IS
 * meaningfully testable without one, and what these assert:
 *
 * 1. The two conditional/fallback branches in `sumEventTypeSiteWide` — a bug
 *    in the ternary could silently drop the eventType filter or misapply the
 *    date bounds, and that is ordinary application logic, not SQL.
 * 2. The one promise `countUniqueVisitorsSiteWide`'s own comment makes: that
 *    it is the single query in the class with no `towTruckId` predicate. A
 *    refactor that "helpfully" scoped it back down to one truck would defeat
 *    the entire point of the method silently — the return type doesn't
 *    change, only the number does.
 *
 * The SQL shape itself (COUNT DISTINCT over a BETWEEN range) is the same
 * statement `countUniqueVisitors` already runs, one predicate fewer — its
 * correctness rides on that sibling method's real-Postgres verification, not
 * a fresh unverified path.
 */

function buildRepository() {
  const aggregate = vi.fn(() => Promise.resolve({ _sum: { eventCount: null } as { eventCount: number | null } }))
  const queryRaw = vi.fn(() => Promise.resolve([] as { count: number }[]))

  const prisma = {
    analyticsDailyStat: { aggregate },
    $queryRaw: queryRaw,
  }

  const repository = new AnalyticsRepository(prisma as never)
  return { repository, aggregate, queryRaw }
}

describe('sumEventTypeSiteWide', () => {
  it('filters by eventType only when no range is given', async () => {
    const { repository, aggregate } = buildRepository()

    await repository.sumEventTypeSiteWide(AnalyticsEventType.PHONE_CLICK)

    expect(aggregate).toHaveBeenCalledWith({
      where: { eventType: AnalyticsEventType.PHONE_CLICK },
      _sum: { eventCount: true },
    })
  })

  it('adds the date bound when a range is given, without dropping eventType', async () => {
    const { repository, aggregate } = buildRepository()

    await repository.sumEventTypeSiteWide(AnalyticsEventType.PHONE_CLICK, {
      from: '2026-07-01',
      to: '2026-07-31',
    })

    const call = aggregate.mock.calls[0]![0] as {
      where: { eventType: unknown; statDate?: { gte: Date; lte: Date } }
    }
    expect(call.where.eventType).toBe(AnalyticsEventType.PHONE_CLICK)
    expect(call.where.statDate?.gte.toISOString().slice(0, 10)).toBe('2026-07-01')
    expect(call.where.statDate?.lte.toISOString().slice(0, 10)).toBe('2026-07-31')
  })

  it('returns 0 rather than null when nothing has ever been counted', async () => {
    const { repository } = buildRepository()

    const total = await repository.sumEventTypeSiteWide(AnalyticsEventType.PHONE_CLICK)

    expect(total).toBe(0)
  })

  it('passes the aggregate through when there is a total', async () => {
    const { repository, aggregate } = buildRepository()
    aggregate.mockResolvedValueOnce({ _sum: { eventCount: 42 } })

    const total = await repository.sumEventTypeSiteWide(AnalyticsEventType.PHONE_CLICK)

    expect(total).toBe(42)
  })
})

describe('countUniqueVisitorsSiteWide', () => {
  it('never filters on towTruckId — the one property that justifies this method existing', async () => {
    const { repository, queryRaw } = buildRepository()

    await repository.countUniqueVisitorsSiteWide(AnalyticsEventType.PHONE_CLICK, {
      from: '2026-07-01',
      to: '2026-07-31',
    })

    // $queryRaw is called as a tagged template: (strings, ...values). Joining
    // the literal segments recovers the SQL text without the interpolated
    // values, which is enough to assert the shape without knowing Prisma's
    // exact parameter-binding format.
    const strings = queryRaw.mock.calls[0]![0] as TemplateStringsArray
    const sql = strings.join('?')
    expect(sql).toContain('AnalyticsVisitorDay')
    expect(sql).toContain('DISTINCT')
    expect(sql).not.toContain('towTruckId')
  })

  it('returns 0 when the query has no rows, never undefined or null', async () => {
    const { repository } = buildRepository()

    const count = await repository.countUniqueVisitorsSiteWide(AnalyticsEventType.PHONE_CLICK, {
      from: '2026-07-01',
      to: '2026-07-31',
    })

    expect(count).toBe(0)
  })

  it('returns the count the query reports', async () => {
    const { repository, queryRaw } = buildRepository()
    queryRaw.mockResolvedValueOnce([{ count: 17 }])

    const count = await repository.countUniqueVisitorsSiteWide(AnalyticsEventType.PHONE_CLICK, {
      from: '2026-07-01',
      to: '2026-07-31',
    })

    expect(count).toBe(17)
  })
})
