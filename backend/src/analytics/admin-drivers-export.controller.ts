import { Controller, Get, Header, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard'
import { toExcelCsv } from '../common/csv'
import { DispatchRepository } from '../dispatch/dispatch.repository'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import { buildDriverExportRows } from './admin-drivers-export.rows'
import { groupEventTotalsByTruck } from './analytics.mapper'
import { AnalyticsRepository } from './analytics.repository'

/**
 * One CSV row per published driver (`TowTruck` — active or deactivated,
 * same "admin sees everyone" rule the panel itself uses), with their
 * all-time calls and dispatch referrals attached — a bulk download of what
 * the panel otherwise only shows one driver, one page, at a time.
 *
 * The sheet's shape lives in `admin-drivers-export.rows.ts`, on purpose: the
 * columns are the part that gets argued about and the part worth a test, and
 * neither needs a Nest container to exercise. What is left here is the reads
 * and the HTTP headers.
 *
 * Lives here rather than in AdminController: it needs `AnalyticsRepository`
 * as much as `TowTrucksRepository`, and AdminModule deliberately does not
 * depend on AnalyticsModule (see analytics.module.ts's own comment — "nothing
 * else in the application depends on analytics"). AnalyticsModule already
 * depends on TowTrucksModule one-directionally, so the export sits on the
 * side of that boundary that can see both without inventing a new one.
 *
 * `DispatchRepository` comes from `DispatchModule`, which AnalyticsModule
 * already imports for the overview's referral counters — so the referral
 * column costs no new module edge.
 *
 * A separate controller from `AdminAnalyticsController` because that one is
 * nested under `:towTruckId` — a route with no id in it belongs on its own.
 */
@Controller('admin/tow-trucks')
@UseGuards(AdminJwtGuard)
export class AdminDriversExportController {
  constructor(
    private readonly towTrucksRepository: TowTrucksRepository,
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly dispatchRepository: DispatchRepository,
  ) {}

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="varordner.csv"')
  async exportDrivers(): Promise<string> {
    const [trucks, statRows] = await Promise.all([
      this.towTrucksRepository.findAllForExport(),
      this.analyticsRepository.sumByEventTypeForAllTrucks(),
    ])

    // Sequential, unlike the two above: the referral counts are keyed by the
    // truck ids the first read returns, so there is nothing to parallelise.
    const dispatchStats = await this.dispatchRepository.statsFor(trucks.map((truck) => truck.id))
    const dispatchTotals = new Map(
      [...dispatchStats].map(([towTruckId, stats]) => [towTruckId, stats.total]),
    )

    return toExcelCsv(
      buildDriverExportRows(trucks, groupEventTotalsByTruck(statRows), dispatchTotals),
    )
  }
}
