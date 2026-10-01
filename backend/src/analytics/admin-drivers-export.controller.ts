import { Controller, Get, Header, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard'
import { toExcelCsv } from '../common/csv'
import { DispatchRepository } from '../dispatch/dispatch.repository'
import { SubscriptionsRepository } from '../subscriptions/subscriptions.repository'
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
 * `SubscriptionsRepository` is the one edge this controller did add, for the
 * payment columns. Inbound only and no cycle: subscriptions knows nothing
 * about analytics, and reading the same repository the panel and the billing
 * crons read is what keeps the sheet's answer and the product's answer the
 * same answer.
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
    private readonly subscriptionsRepository: SubscriptionsRepository,
  ) {}

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="varordner.csv"')
  async exportDrivers(): Promise<string> {
    const [trucks, statRows] = await Promise.all([
      this.towTrucksRepository.findAllForExport(),
      this.analyticsRepository.sumByEventTypeForAllTrucks(),
    ])

    // A second round, because both of these are keyed by the truck ids the
    // first read returns — but parallel with each other, since neither needs
    // the other's answer.
    const ids = trucks.map((truck) => truck.id)
    const [dispatchStats, coverage] = await Promise.all([
      this.dispatchRepository.statsFor(ids),
      this.subscriptionsRepository.findCoverage(ids),
    ])

    const dispatchTotals = new Map(
      [...dispatchStats].map(([towTruckId, stats]) => [towTruckId, stats.total]),
    )
    // Only `coveredUntil` crosses into the sheet. The rest of the coverage row
    // — what was money and what was an admin's promise — is a distinction the
    // panel makes and a CSV cell cannot.
    const coveredUntil = new Map(
      [...coverage].map(([towTruckId, row]) => [towTruckId, row.coveredUntil]),
    )

    // One instant for the whole sheet. Read per row, a long export could put
    // two different "todays" in one file and call two identical drivers
    // «Պետք է վճարի» and «Ժամկետանց է».
    const now = new Date()

    return toExcelCsv(
      buildDriverExportRows(
        trucks,
        groupEventTotalsByTruck(statRows),
        dispatchTotals,
        coveredUntil,
        now,
      ),
    )
  }
}
