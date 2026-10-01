import { armeniaDateLabel } from '../common/armenia-day'
import { derivePaymentStatus, type PaymentStatus } from '../subscriptions/subscription-status'
import { AnalyticsEventType } from './analytics.enums'
import type { AnalyticsEventTotals } from './analytics.types'

/**
 * The admin drivers CSV, as a pure function of the four reads behind it.
 *
 * Separate from the controller so the sheet's shape is testable without a Nest
 * container — this file is the format, the controller is only the plumbing and
 * the HTTP headers. See `admin-drivers-export.controller.ts`.
 *
 * ## The columns, and why the rest are not here
 *
 * The sheet answers two questions: who is worth keeping, and who owes money.
 * Everything that served neither is gone — «Ընկերություն» (empty for most
 * rows, and the driver's name is what an admin actually searches),
 * «Դիտումներ», WhatsApp and Telegram clicks (three near-zero columns that
 * made the one number people read — the calls — harder to find).
 *
 * ## Payment is two columns and a date, not one column
 *
 * «Վճարում» is the state; «Ակտիվ» is whether their listing is published.
 * They are separate facts about one driver and they are separate columns,
 * because the interesting rows are the ones where they disagree — a
 * deactivated driver is usually deactivated OVER money, and collapsing both
 * into a single cell would erase that link from the one sheet where it should
 * be visible. Two columns also stay filterable: "overdue AND still active" is
 * a sort in Excel rather than a question nobody can ask.
 *
 * «Վճարման ժամկետը» is `coveredUntil` — the same value `derivePaymentStatus`
 * reads, so the date can never disagree with the word beside it. Not labelled
 * "paid until": for a driver an admin billed but who has never paid, that
 * instant is a DEADLINE, and a column calling it a payment would be stating
 * something false about the person most likely to be chased over it. Empty
 * means there is nothing to be late for — nobody has paid and nobody has set
 * a date.
 *
 * «Ակտիվ» was dropped from this sheet once, when it only answered "who to
 * call"; the reasoning then was that activation is decided in the panel. The
 * sheet's job has since grown a second half, and under that half the column
 * earns its place.
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
  'Վճարում',
  'Վճարման ժամկետը',
  'Ակտիվ',
] as const

/**
 * The four payment states, spelled the way an admin would say them.
 *
 * A `Record` rather than a switch so adding a fifth `PaymentStatus` fails to
 * compile here instead of printing an empty cell in a billing sheet.
 */
const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  paid: 'Վճարված է',
  'due-soon': 'Պետք է վճարի',
  overdue: 'Ժամկետանց է',
  unpaid: 'Դեռ չի վճարել',
}

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
  isActive: boolean
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
  coveredUntilByTruck: ReadonlyMap<number, Date | null>,
  now: Date = new Date(),
): string[][] {
  const rows = drivers.map((driver) => {
    // Absent from the map is the same answer as present-but-null: nobody has
    // paid and nobody has set them a deadline. `derivePaymentStatus` reads
    // that as `unpaid`, which is exactly right — and the reason this argument
    // is required rather than defaulted, since an omitted map would quietly
    // call every driver on the platform a non-payer.
    const coveredUntil = coveredUntilByTruck.get(driver.id) ?? null

    return [
      driver.driverName,
      driver.phone,
      String(eventTotalsByTruck.get(driver.id)?.[AnalyticsEventType.PHONE_CLICK] ?? 0),
      String(dispatchTotalsByTruck.get(driver.id) ?? 0),
      driver.locationName,
      driver.isPartner ? 'Այո' : 'Ոչ',
      PAYMENT_LABELS[derivePaymentStatus(coveredUntil, now)],
      coveredUntil === null ? '' : armeniaDateLabel(coveredUntil),
      driver.isActive ? 'Այո' : 'Ոչ',
    ]
  })

  return [[...DRIVER_EXPORT_HEADER], ...rows]
}
