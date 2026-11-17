/**
 * In-house error tracking (2026-11-17). Plain functions over the live-dispatch
 * `Sql` interface so the API (Nest) and the worker (no Nest) record the same
 * way. See the ErrorGroup migration for the shape.
 *
 * - Grouped by fingerprint: source + the message with numbers/ids blanked +
 *   the first stack frame. «Order 17 not found» and «Order 18 not found» are
 *   one problem.
 * - A NEW group — or one that comes back after an admin marked it resolved —
 *   is reported on Telegram (through the same ops channel as order alerts),
 *   at most MAX_TELEGRAM_PER_HOUR per process, so a crash storm is a few
 *   messages and a big counter, never a flood.
 * - Recording never throws: tracking an error must not cause one.
 * - Never personal data in the message we store: phone numbers and long digit
 *   runs are blanked before anything is written.
 */
import { createHash } from 'node:crypto'
import type { OpsChannel } from '../live-dispatch/notify/ops-telegram'
import type { Sql } from '../live-dispatch/platform/sql'

export type ErrorSource = 'api' | 'worker' | 'admin' | 'mobile'
export const ERROR_SOURCES: readonly ErrorSource[] = ['api', 'worker', 'admin', 'mobile']

export interface ErrorReport {
  source: ErrorSource
  message: string
  stack?: string | null
  context?: Record<string, unknown>
  release?: string | null
}

const MAX_MESSAGE = 1_000
const MAX_STACK = 8_000
const MAX_CONTEXT = 4_000
const MAX_TELEGRAM_PER_HOUR = 10
/**
 * Above this many open groups OF ONE SOURCE a new fingerprint of that source
 * is dropped. Per source (2026-11-18): the public endpoint can only write
 * 'admin' / 'mobile', so a flood of fake reports can never use up the room
 * the backend's own errors ('api', 'worker') need.
 */
export const MAX_OPEN_GROUPS = 2_000

/** Sources anyone may claim through the public POST /errors/client */
const PUBLIC_SOURCES: readonly ErrorSource[] = ['admin', 'mobile']

/**
 * Links and @handles out of the Telegram text (2026-11-18). A public report's
 * message is written by whoever sent it; Telegram makes any URL in a message
 * clickable, so without this the endpoint would let anyone put a link of
 * their choosing in the admins' chat. The admin page still shows the stored text.
 */
export function withoutLinks(text: string): string {
  return text.replace(/\b(?:https?:\/\/|www\.)\S+|\bt\.me\/\S+|@[A-Za-z0-9_]{4,}/gi, '‹link›')
}

/** Phone numbers and long digit runs out of anything we store or send. Pure. */
export function scrub(text: string): string {
  return text
    .replace(/\+?374\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}/g, '+374…')
    .replace(/\b0\d{8}\b/g, '0…')
    .replace(/\b\d{9,}\b/g, '…')
}

/** The same problem → the same fingerprint, whatever ids or numbers it mentions. Pure. */
export function fingerprint(report: Pick<ErrorReport, 'source' | 'message' | 'stack'>): string {
  const shape = scrub(report.message)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\d+/g, '<n>')
    .trim()
    .slice(0, 300)
  const frame =
    (report.stack ?? '')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('at ') || /@.+:\d+/.test(line))
      ?.replace(/:\d+:\d+\)?$/, '')
      .replace(/\?[^)\s]*/, '') ?? ''
  return createHash('sha1').update(`${report.source}|${shape}|${frame}`).digest('hex')
}

let telegramWindowStart = 0
let telegramSent = 0
/** Tests only */
export function resetErrorTelegramBudget(): void {
  telegramWindowStart = 0
  telegramSent = 0
}

function takeTelegramBudget(now: number): boolean {
  if (now - telegramWindowStart > 3_600_000) {
    telegramWindowStart = now
    telegramSent = 0
  }
  if (telegramSent >= MAX_TELEGRAM_PER_HOUR) return false
  telegramSent++
  return true
}

const SOURCE_LABEL: Record<ErrorSource, string> = { api: 'Backend', worker: 'Worker', admin: 'Admin վահանակ', mobile: 'Վարորդի հավելված' }

/**
 * Records one occurrence. Returns 'new' (first time, or back after «resolved»),
 * 'repeat', or 'dropped'. Never throws.
 */
export async function recordError(
  db: Sql,
  report: ErrorReport,
  options: { ops?: OpsChannel; frontendUrl?: string; now?: number } = {},
): Promise<'new' | 'repeat' | 'dropped'> {
  try {
    const message = scrub(String(report.message || 'Unknown error')).slice(0, MAX_MESSAGE)
    const stack = report.stack ? scrub(String(report.stack)).slice(0, MAX_STACK) : null
    let context = JSON.stringify(report.context ?? {})
    if (context.length > MAX_CONTEXT) context = JSON.stringify({ truncated: true })
    context = scrub(context)
    const print = fingerprint({ source: report.source, message, stack })

    const existing = await db.query<{ id: number; resolvedAt: unknown }>(`SELECT "id", "resolvedAt" FROM "ErrorGroup" WHERE "fingerprint" = $1`, [print])
    if (existing.length === 0) {
      const [{ open }] = await db.query<{ open: number }>(`SELECT count(*)::int AS "open" FROM "ErrorGroup" WHERE "resolvedAt" IS NULL AND "source" = $1`, [report.source])
      if (Number(open) >= MAX_OPEN_GROUPS) return 'dropped'
    }
    const [row] = await db.query<{ id: number; fresh: boolean; reopened: boolean }>(
      `INSERT INTO "ErrorGroup" ("fingerprint", "source", "message", "stack", "context", "release")
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT ("fingerprint") DO UPDATE SET
         "count" = "ErrorGroup"."count" + 1,
         "lastSeenAt" = now(),
         "context" = EXCLUDED."context",
         "release" = COALESCE(EXCLUDED."release", "ErrorGroup"."release"),
         "resolvedAt" = NULL
       RETURNING "id", ("xmax" = 0) AS "fresh", $7::boolean AS "reopened"`,
      [print, report.source, message, stack, context, report.release ?? null, existing.length > 0 && existing[0].resolvedAt !== null],
    )
    const isNew = Boolean(row.fresh) || Boolean(row.reopened)
    if (isNew && options.ops && takeTelegramBudget(options.now ?? Date.now())) {
      const url = options.frontendUrl ? `${options.frontendUrl}/admin/orders/errors` : undefined
      await options.ops
        .send({
          text: `🐞 ${row.reopened ? 'Սխալը կրկնվեց (նշված էր լուծված)' : 'Նոր սխալ'} · ${SOURCE_LABEL[report.source]}\n${(PUBLIC_SOURCES.includes(report.source) ? withoutLinks(message) : message).slice(0, 300)}`,
          ...(url ? { button: { text: 'Բացել սխալները', url } } : {}),
        })
        .catch(() => undefined)
    }
    return isNew ? 'new' : 'repeat'
  } catch {
    return 'dropped'
  }
}
