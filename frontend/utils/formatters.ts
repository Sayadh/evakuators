/** 3.5 → "3.5 տ" */
export function formatCapacity(tons: number): string {
  return `${tons} տ`
}

/** 12.4 → "12.4 կմ" */
export function formatDistance(km: number): string {
  return `${km.toFixed(1)} կմ`
}

/**
 * ## Why this file formats Armenian dates by hand
 *
 * It used to call `toLocaleDateString('hy-AM', …)` and trust the runtime. That
 * produced a **hydration mismatch on every page showing a date**, because the
 * server and the visitor's browser are two different JavaScript runtimes with
 * two different ICU builds, and they did not agree:
 *
 * | Runtime | Same input, same requested locale |
 * | --- | --- |
 * | Node (full ICU) | `օգոստոսի 7, 20:15` |
 * | A browser without `hy` data | `7 августа в 20:15` |
 *
 * Per the ECMA-402 spec a runtime that lacks the requested locale falls back to
 * its **own default**, so a visitor whose browser is set to Russian was served
 * Armenian HTML and then re-rendered it in Russian. Vue reported
 * "Hydration completed but contains mismatches" and replaced the node.
 *
 * Note the Node row is wrong too: `օգոստոսի 7` puts the month first, which is
 * English word order. Correct Armenian is `7 օգոստոսի`. So there was no locale
 * string that would have fixed this — the premise of asking ICU was the bug.
 *
 * Everything below is therefore built from an explicit month table and plain
 * digits. Identical output in every runtime, by construction rather than by
 * hoping two CLDR versions match.
 *
 * Armenian labels living in the frontend as constants is also this project's
 * standing rule — see CLAUDE.md.
 */

/**
 * Genitive ("of August"), because that is the case Armenian uses when a day
 * precedes the month: «7 օգոստոսի», never «7 օգոստոս».
 */
const ARMENIAN_MONTHS_GENITIVE = [
  'հունվարի',
  'փետրվարի',
  'մարտի',
  'ապրիլի',
  'մայիսի',
  'հունիսի',
  'հուլիսի',
  'օգոստոսի',
  'սեպտեմբերի',
  'հոկտեմբերի',
  'նոյեմբերի',
  'դեկտեմբերի',
] as const

/**
 * Splits an instant into Armenia's wall-clock fields.
 *
 * `Intl` is still used, but only to answer "what time is it in Yerevan" — never
 * to produce a word. Every option here is pinned so the output cannot vary:
 * `numberingSystem: 'latn'` rules out Eastern Arabic digits, `hourCycle: 'h23'`
 * rules out a 12-hour clock with an AM/PM marker, and `timeZone` is explicit so
 * the answer does not depend on where the server or the reader happens to be.
 *
 * Pinning the timezone is not cosmetic. Without it a departure time was
 * rendered in the *reader's* zone, so the same route read 20:15 in Yerevan and
 * 18:15 in Moscow — for a driver leaving from an Armenian city, only one of
 * those is a fact. `Asia/Yerevan` (not a hardcoded +4) so a future DST change
 * is the timezone database's problem, not ours.
 *
 * Same reasoning, and the same `en-CA`-plus-timezone technique, as
 * `AnalyticsClock` on the backend — see docs/analytics.md.
 */
const YEREVAN_FIELDS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Yerevan',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  numberingSystem: 'latn',
})

interface DateFields {
  year: string
  month: number
  day: number
  hour: string
  minute: string
}

function yerevanFields(date: Date): DateFields {
  const parts = YEREVAN_FIELDS.formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? ''

  return {
    year: value('year'),
    month: Number(value('month')),
    day: Number(value('day')),
    hour: value('hour'),
    minute: value('minute'),
  }
}

/** 1-based month number → "օգոստոսի". Out-of-range returns '' rather than throwing. */
function monthName(month: number): string {
  return ARMENIAN_MONTHS_GENITIVE[month - 1] ?? ''
}

/**
 * '2026-07-27' → "27 հուլիսի"
 *
 * The input is a plain calendar-day key, not an instant — the backend already
 * resolved it to an Armenia day (see docs/analytics.md). So it is split as a
 * string and never turned into a `Date`: constructing one would introduce a
 * timezone the value does not have, and could shift the label by a day.
 */
export function formatDateKeyLong(dateKey: string): string {
  const [, month, day] = dateKey.split('-')
  return `${Number(day)} ${monthName(Number(month))}`
}

/** '2026-07-27' → "27.07" — compact chart axis label */
export function formatDateKeyShort(dateKey: string): string {
  const [, month, day] = dateKey.split('-')
  return `${day}.${month}`
}

/**
 * 12345 → "12 345" — thin-spaced thousands, readable at a glance on a card.
 *
 * Grouped by hand for the same reason the dates are: `toLocaleString('hy-AM')`
 * gives `12 345` on a runtime that has the locale and `12,345` on one that
 * falls back to `en-US`. The separator is U+00A0 (non-breaking) so a number
 * never wraps across two lines.
 */
export function formatCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** ISO datetime → "7 օգոստոսի, 20:15" (Armenia time) */
export function formatDepartureAt(iso: string): string {
  const { day, month, hour, minute } = yerevanFields(new Date(iso))
  return `${day} ${monthName(month)}, ${hour}:${minute}`
}

/** ISO datetime → "7 օգոստոսի 2026 թ." (Armenia time) — for dates without a clock time */
export function formatDateLong(iso: string): string {
  const { day, month, year } = yerevanFields(new Date(iso))
  return `${day} ${monthName(month)} ${year} թ.`
}

/**
 * ISO datetime → "07.08.2026" — for dense lists (moderation tables) where a
 * spelled-out month costs more room than it earns.
 */
export function formatDateNumeric(iso: string): string {
  const { day, month, year } = yerevanFields(new Date(iso))
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`
}
