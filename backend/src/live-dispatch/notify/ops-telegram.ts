/**
 * Operator alerts on Telegram (2026-11-17) — what used to reach the operator
 * only while the admin page was open in a browser.
 *
 * Sent through the ADMIN bot (ADMIN_TELEGRAM_BOT_TOKEN, the one already used
 * for admin 2FA and new-registration notices) to every admin account that
 * linked its Telegram (`User.telegramChatId`). No new chat-id setting: linking
 * Telegram for 2FA is what subscribes an operator. Unconfigured bot → silent
 * no-op, like the rest of that bot's uses.
 *
 * Off production, every message is prefixed with the site's host
 * («[staging.evakuators.am]»): staging's database is a copy of production's,
 * so the same admins are linked, and a staging alert must never read as a
 * real one.
 *
 * Words are Armenian and the backend has no taxonomy — the cancel reason
 * labels below mirror frontend/utils/opsDispatchLabels.ts by hand.
 */
import { toNumber } from '../platform/params'
import type { Sql } from '../platform/sql'

export interface OpsMessage {
  text: string
  /** A button under the message */
  button?: { text: string; url: string }
}

export interface OpsChannel {
  /** Throws when it could reach nobody (the outbox retries); 'skipped' when unconfigured or nobody is linked */
  send(message: OpsMessage): Promise<'sent' | 'skipped'>
}

/** Alert kinds that reach Telegram — the ones that need a person now. GPS/"not moving" noise stays in the console. */
export const OPS_TELEGRAM_ALERT_KINDS: readonly string[] = [
  'DRIVER_CANCEL_REQUEST',
  'DRIVER_CANCELLED_REDISPATCHED',
  'DRIVER_PROBLEM',
  'DRIVER_CANCEL_STALLED',
  'SEARCH_FAILED',
  'PRICE_REVIEW',
]

/** Mirrors CANCEL_REASON_LABEL in frontend/utils/opsDispatchLabels.ts */
const REASON: Record<string, string> = {
  DRIVER_CANNOT_PERFORM: 'Վարորդը չի կարող կատարել',
  CUSTOMER_DECLINED: 'Հաճախորդը հրաժարվել է',
  CUSTOMER_WILL_CALL: 'Հաճախորդը կզանգի (մտածում է)',
  WRONG_DATA: 'Սխալ տվյալներ',
  PRICE_NOT_AGREED: 'Գինը չի համաձայնեցվել',
  TECHNICAL_PROBLEM: 'Տեխնիկական խնդիր',
  OTHER: 'Այլ',
  NOT_SPECIFIED: 'Պատճառը չնշվեց',
}

const amd = (value: unknown) => (typeof value === 'number' ? `${value.toLocaleString('en-US').replace(/,/g, ' ')} ֏` : null)

export interface AlertForText {
  kind: string
  data: Record<string, unknown>
  orderId: number
  orderNumber: string
  customerPhone: string | null
  driver: { name: string | null; phone: string | null } | null
}

/** The message for one alert, or null when the kind does not go to Telegram. Pure. */
export function opsAlertText(alert: AlertForText, frontendUrl: string): OpsMessage | null {
  if (!OPS_TELEGRAM_ALERT_KINDS.includes(alert.kind)) return null
  const d = alert.data
  const reason = typeof d.reason === 'string' ? (REASON[d.reason] ?? d.reason) : null
  const driver = alert.driver ? [alert.driver.name, alert.driver.phone].filter(Boolean).join(' · ') : null
  const prices = [amd(d.driverPriceAmd) && `վարորդն ասել է՝ ${amd(d.driverPriceAmd)}`, amd(d.customerPriceAmd) && `հաճախորդը՝ ${amd(d.customerPriceAmd)}`]
    .filter(Boolean)
    .join(', ')
  let title: string
  switch (alert.kind) {
    case 'DRIVER_CANCEL_REQUEST':
      title = d.released === true ? '📞 Վարորդն ազատվեց․ հաճախորդը կզանգի կամ հրաժարվեց — զանգեք հաճախորդին' : '⚠️ Վարորդը խնդրում է չեղարկել'
      break
    case 'DRIVER_CANCELLED_REDISPATCHED':
      title = '🔁 Վարորդը հրաժարվեց, պատվերը փոխանցվեց այլ վարորդի'
      break
    case 'DRIVER_PROBLEM':
      title = '⚠️ Վարորդը խնդիր է հայտնել'
      break
    case 'DRIVER_CANCEL_STALLED':
      title = '⏳ Վարորդը բացել է չեղարկումը և չի ավարտում — զանգեք վարորդին'
      break
    case 'SEARCH_FAILED':
      title = '❌ Վարորդ չգտնվեց'
      break
    default:
      title = `💰 Վարորդը գրել է նվազագույն գինը${amd(d.priceAmd) ? ` (${amd(d.priceAmd)})` : ''} — զանգեք հաճախորդին`
  }
  const lines = [
    `${alert.orderNumber} · ${title}`,
    reason ? `Պատճառ՝ ${reason}` : null,
    prices ? `Գին՝ ${prices}` : null,
    driver ? `Վարորդ՝ ${driver}` : null,
    alert.customerPhone && (alert.kind === 'DRIVER_CANCEL_REQUEST' || alert.kind === 'PRICE_REVIEW' || alert.kind === 'SEARCH_FAILED')
      ? `Հաճախորդ՝ ${alert.customerPhone}`
      : null,
  ]
  return { text: lines.filter(Boolean).join('\n'), button: { text: 'Բացել պատվերը', url: `${frontendUrl}/admin/orders/${alert.orderId}` } }
}

/** Loads one alert with what its message needs */
export async function loadAlertForText(db: Sql, alertId: number): Promise<AlertForText | null> {
  const [row] = await db.query<Record<string, unknown>>(
    `SELECT a."kind", a."data", a."orderId", o."number", o."customerPhone", t."driverName", t."phone" AS "driverPhone"
       FROM "OrderAlert" a
       JOIN "DispatchOrder" o ON o."id" = a."orderId"
       LEFT JOIN "FleetDriverProfile" t ON t."id" = NULLIF(a."data"->>'driverId', '')::int
      WHERE a."id" = $1::int`,
    [alertId],
  )
  if (!row) return null
  const data = (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) as Record<string, unknown>
  return {
    kind: String(row.kind),
    data,
    orderId: toNumber(row.orderId),
    orderNumber: String(row.number),
    customerPhone: row.customerPhone === null ? null : String(row.customerPhone),
    driver: row.driverName === null && row.driverPhone === null ? null : { name: row.driverName === null ? null : String(row.driverName), phone: row.driverPhone === null ? null : String(row.driverPhone) },
  }
}

/** «[staging.evakuators.am] » off production, nothing on it */
export function environmentPrefix(frontendUrl: string): string {
  try {
    const host = new URL(frontendUrl).host
    return host === 'evakuators.am' || host === 'www.evakuators.am' ? '' : `[${host}] `
  } catch {
    return '[?] '
  }
}

export class TelegramOpsChannel implements OpsChannel {
  private readonly prefix: string

  constructor(
    private readonly db: Sql,
    private readonly options: { botToken: string; frontendUrl: string; fetchImpl?: typeof fetch; timeoutMs?: number },
  ) {
    this.prefix = environmentPrefix(options.frontendUrl)
  }

  async send(message: OpsMessage): Promise<'sent' | 'skipped'> {
    if (!this.options.botToken) return 'skipped'
    const chats = await this.db.query<{ chatId: string }>(`SELECT "telegramChatId"::text AS "chatId" FROM "User" WHERE "telegramChatId" IS NOT NULL`)
    if (chats.length === 0) return 'skipped'
    const doFetch = this.options.fetchImpl ?? fetch
    const results = await Promise.allSettled(
      chats.map(async ({ chatId }) => {
        const response = await doFetch(`https://api.telegram.org/bot${this.options.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 8_000),
          body: JSON.stringify({
            chat_id: chatId,
            text: `${this.prefix}${message.text}`,
            disable_web_page_preview: true,
            ...(message.button ? { reply_markup: { inline_keyboard: [[{ text: message.button.text, url: message.button.url }]] } } : {}),
          }),
        })
        if (!response.ok) throw new Error(`Telegram ${response.status}`)
      }),
    )
    // One admin who blocked the bot must not make the others get it twice: retry only when nobody got it
    if (results.every((r) => r.status === 'rejected')) throw new Error(`ops telegram: all ${results.length} sends failed`)
    return 'sent'
  }
}

/** Tests: remembers what would have been sent */
export class RecordingOpsChannel implements OpsChannel {
  readonly sent: OpsMessage[] = []
  async send(message: OpsMessage): Promise<'sent' | 'skipped'> {
    this.sent.push(message)
    return 'sent'
  }
}
