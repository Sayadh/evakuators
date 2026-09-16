import { AnalyticsEventType } from './analytics.enums'
import type { AnalyticsEventTotals } from './analytics.types'

/**
 * The admin drivers CSV, as a pure function of the three reads behind it.
 *
 * Separate from the controller so the sheet's shape is testable without a Nest
 * container — this file is the format, the controller is only the plumbing and
 * the HTTP headers. See `admin-drivers-export.controller.ts`.
 *
 * ## Six columns, and why the rest were dropped
 *
 * The sheet is read for one job: deciding who to call and who is worth
 * keeping. Everything that did not serve that is gone — «Ընկերություն»
 * (empty for most rows, and the driver's name is what an admin actually
 * searches), «Ակտիվ» (the panel is where activation is decided, and a
 * deactivated row is not the export's story), «Դիտումներ», WhatsApp and
 * Telegram clicks (three near-zero columns that made the one number people
 * read — the calls — harder to find).
 *
 * `EMAIL_CLICK` was already deliberately absent: the public profile no longer
 * shows an email to click, so the column would read as a metric the site still
 * tracks when it cannot fire again.
 *
 * ## Both counters are all-time
 *
 * Not "this month": the sheet has no period selector and no column saying
 * which period it covers, so a windowed number would be a number nobody could
 * interpret a week later. The dashboard is where a period is chosen; this is
 * the whole history, on purpose.
 */
export const DRIVER_EXPORT_HEADER = [
  'Անուն Ազգանուն',
  'Հեռախոս',
  'Զանգեր (ընդամենը)',
  'Ուղղորդումներ (ընդամենը)',
  'Հիմնական գտնվելու վայրը',
  'Մեր վարորդը',
] as const

/** One driver, as the export's own read of `TowTruck` hands them over */
export interface DriverExportRow {
  id: number
  driverName: string
  phone: string
  /**
   * The base, as an admin composed it when they set it — see
   * `composeLocationName` on the frontend. Stored free text rather than a
   * slug on purpose: the backend has no geography (CLAUDE.md), so this string
   * is the only label it can put in a cell.
   */
  locationName: string
  isPartner: boolean
}

/**
 * Builds the sheet: header first, then one row per driver in the order they
 * were read (`findAllForExport` sorts by `createdAt`, oldest first).
 *
 * A driver missing from either map has never had the thing counted — no
 * tracked call, no referral — which is a real zero, not missing data, so both
 * default to 0 rather than to an empty cell.
 *
 * Numbers are stringified here rather than in the controller because a CSV
 * cell is a string; `toCsv` takes `string[][]` and nothing downstream should
 * have to decide how a count is spelled.
 */
export function buildDriverExportRows(
  drivers: readonly DriverExportRow[],
  eventTotalsByTruck: ReadonlyMap<number, AnalyticsEventTotals>,
  dispatchTotalsByTruck: ReadonlyMap<number, number>,
): string[][] {
  const rows = drivers.map((driver) => [
    driver.driverName,
    driver.phone,
    String(eventTotalsByTruck.get(driver.id)?.[AnalyticsEventType.PHONE_CLICK] ?? 0),
    String(dispatchTotalsByTruck.get(driver.id) ?? 0),
    driver.locationName,
    driver.isPartner ? 'Այո' : 'Ոչ',
  ])

  return [[...DRIVER_EXPORT_HEADER], ...rows]
}
