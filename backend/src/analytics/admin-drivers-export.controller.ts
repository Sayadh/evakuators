import { Controller, Get, Header, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard'
import { toExcelCsv } from '../common/csv'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import { groupEventTotalsByTruck } from './analytics.mapper'
import { AnalyticsEventType } from './analytics.enums'
import { AnalyticsRepository } from './analytics.repository'

const CSV_HEADER = [
  'Անուն Ազգանուն',
  'Ընկերություն',
  'Հեռախոս',
  'Ակտիվ',
  'Դիտումներ (ընդամենը)',
  'Հեռախոսի սեղմումներ',
  'WhatsApp սեղմումներ',
  'Telegram սեղմումներ',
]

/**
 * One CSV row per published driver (`TowTruck` — active or deactivated,
 * same "admin sees everyone" rule the panel itself uses), with their
 * all-time traffic totals attached — a bulk download of what the panel
 * otherwise only shows one driver, one page, at a time.
 *
 * Lives here rather than in AdminController: it needs `AnalyticsRepository`
 * as much as `TowTrucksRepository`, and AdminModule deliberately does not
 * depend on AnalyticsModule (see analytics.module.ts's own comment — "nothing
 * else in the application depends on analytics"). AnalyticsModule already
 * depends on TowTrucksModule one-directionally, so the export sits on the
 * side of that boundary that can see both without inventing a new one.
 *
 * A separate controller from `AdminAnalyticsController` because that one is
 * nested under `:towTruckId` — a route with no id in it belongs on its own.
 *
 * `EMAIL_CLICK` is deliberately left out of the sheet: the public profile no
 * longer shows an email address to click (see the privacy-policy consent
 * work), so the column would read as a metric the site still tracks when it
 * cannot fire again — the historical few rows some old trucks may still hold
 * are not worth a column that reads as broken to everyone else.
 */
@Controller('admin/tow-trucks')
@UseGuards(AdminJwtGuard)
export class AdminDriversExportController {
  constructor(
    private readonly towTrucksRepository: TowTrucksRepository,
    private readonly analyticsRepository: AnalyticsRepository,
  ) {}

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="varordner.csv"')
  async exportDrivers(): Promise<string> {
    const [trucks, statRows] = await Promise.all([
      this.towTrucksRepository.findAllForExport(),
      this.analyticsRepository.sumByEventTypeForAllTrucks(),
    ])
    const totalsByTruck = groupEventTotalsByTruck(statRows)

    const rows = trucks.map((truck) => {
      const totals = totalsByTruck.get(truck.id)
      return [
        truck.driverName,
        truck.companyName ?? '',
        truck.phone,
        truck.isActive ? 'Այո' : 'Ոչ',
        String(totals?.[AnalyticsEventType.PAGE_VIEW] ?? 0),
        String(totals?.[AnalyticsEventType.PHONE_CLICK] ?? 0),
        String(totals?.[AnalyticsEventType.WHATSAPP_CLICK] ?? 0),
        String(totals?.[AnalyticsEventType.TELEGRAM_CLICK] ?? 0),
      ]
    })

    return toExcelCsv([CSV_HEADER, ...rows])
  }
}
