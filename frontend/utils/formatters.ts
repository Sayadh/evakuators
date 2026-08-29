/** 3.5 → "3.5 տ" */
export function formatCapacity(tons: number): string {
  return `${tons} տ`
}

/*
 * There is deliberately no `formatDistance` here.
 *
 * There used to be one — `(km: number) => "12.4 կմ"` — with no callers left. It
 * collided by name with the real one in `utils/formatDistance.ts`, which takes
 * **metres**, and Nuxt's auto-import resolves a duplicated name to exactly one
 * winner: this file. The build said so on every run ("Duplicated imports
 * \"formatDistance\", the one from utils/formatDistance.ts has been ignored"),
 * as a warning nothing fails on.
 *
 * Nothing was broken by it only because the one component that formats a
 * distance imports `formatDistanceLine` from the other file explicitly. The
 * moment anyone wrote a bare auto-imported `formatDistance(meters)` — the
 * obvious thing to write, and what the editor's autocomplete offers — they
 * would have silently got the kilometre version and rendered a 4 km road
 * distance as «4123.0 կմ». Keeping a unit-incompatible duplicate of a name
 * that auto-imports globally is the whole hazard; deleting the unused one
 * removes it.
 */

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

/**
 * Departure + estimated arrival → "7 օգոստոսի, 12:00–19:00" (Armenia time) —
 * how long the driver expects to be on this route, not just when they set
 * off. `estimatedArrivalAt` is optional only for a route posted before that
 * field existed; for one of those this falls back to `formatDepartureAt`
 * alone rather than showing a range with a made-up end.
 *
 * A same-day trip shows one date with two clock times. A trip that crosses
 * midnight (rare, but the arrival-time field allows it) repeats the date on
 * the arrival side so the range still reads as two distinct instants rather
 * than implying a 19:00 arrival earlier the same day.
 */
export function formatDepartureRange(departureIso: string, arrivalIso?: string): string {
  if (!arrivalIso) return formatDepartureAt(departureIso)

  const departure = yerevanFields(new Date(departureIso))
  const arrival = yerevanFields(new Date(arrivalIso))

  const departureLabel = `${departure.day} ${monthName(departure.month)}`
  if (departure.year === arrival.year && departure.month === arrival.month && departure.day === arrival.day) {
    return `${departureLabel}, ${departure.hour}:${departure.minute}–${arrival.hour}:${arrival.minute}`
  }

  const arrivalLabel = `${arrival.day} ${monthName(arrival.month)}`
  return `${departureLabel}, ${departure.hour}:${departure.minute} – ${arrivalLabel}, ${arrival.hour}:${arrival.minute}`
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

/**
 * A moment → "14:32" (Armenia time, 24-hour).
 *
 * Takes a `Date` rather than an ISO string: the one caller is timing something
 * that happened in this browser (when a cached search was made), so there is
 * no server-produced string to parse and turning it into one just to parse it
 * back would be ceremony.
 *
 * Goes through `yerevanFields` like everything else here, so it inherits the
 * pinned `hourCycle: 'h23'` and `numberingSystem: 'latn'` — without those, the
 * same instant renders "2:32 PM" or with Eastern Arabic digits depending on
 * the reader's browser.
 */
export function formatClockTime(date: Date): string {
  const { hour, minute } = yerevanFields(date)
  return `${hour}:${minute}`
}

/**
 * A moment → "2026-08-12", the Armenia calendar day it falls on.
 *
 * Not for display — this is a storage key, which is why it is ISO and not
 * Armenian. It answers "is this still today?" for the daily search limit, and
 * it has to agree with the backend's `armeniaDateKey()` so that a limit which
 * says «փորձեք վաղը» resets when tomorrow actually starts in Yerevan, rather
 * than at whatever midnight the reader's device is set to.
 *
 * The ban on runtime localisation (CLAUDE.md) is about producing *words* that
 * two runtimes might spell differently. `YYYY-MM-DD` from `en-CA` is the same
 * technique the backend uses for exactly the same reason, and produces the
 * same string everywhere.
 */
export function yerevanDateKey(date: Date): string {
  const { year, month, day } = yerevanFields(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
