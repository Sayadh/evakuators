/**
 * What went wrong with an order, in words an operator acts on (2026-11-16).
 *
 * Everything here is derived from data the console already loads — the
 * order, its audit timeline, its assignments and the open alerts — so there
 * is one source of truth (the backend's OrderEvent / OrderAlert rows) and
 * this file only decides how to SAY it:
 *
 * - `orderIncidents(detail)` — every incident, newest first, each with who,
 *   why, when and whether it still needs the operator (`open`). The order
 *   page shows the open ones as banners on top and all of them as history.
 * - `listIncident(order, alerts)` — the one chip a row of the orders list
 *   shows, and whether that row belongs at the top (`urgent`).
 *
 * Pure: unit-tested in tests/orderIncidents.spec.ts.
 */
import type { AttentionKind, OpsAlert, OpsOrder, OpsOrderDetail, OpsTimelineEvent } from '~/types/opsDispatch'
import { ATTENTION_LABEL, CANCEL_REASON_LABEL, SEARCH_FAILURE_KINDS } from './opsDispatchLabels'
import { formatClockTime } from './formatters'
import { formatPrice } from './formatPrice'

export type IncidentKind =
  | 'CANCELLED'
  | 'DRIVER_CANCEL_REQUEST'
  | 'DRIVER_PROBLEM'
  | 'DRIVER_WITHDREW'
  | 'CUSTOMER_PENDING'
  | 'RELEASED_BY_OPERATOR'
  | 'SEARCH_FAILED'
  | 'WAITING_FOR_DRIVER'
export type IncidentTone = 'danger' | 'warn' | 'info'

export interface OrderIncident {
  id: string
  kind: IncidentKind
  tone: IncidentTone
  title: string
  /** The reason in words (a known code is translated, free text is kept) */
  reason: string | null
  comment: string | null
  /** «Գինը չհամաձայնեցվեց» (2026-11-17): what the driver asked and what the customer offered */
  prices: string | null
  actor: { type: 'ADMIN' | 'DRIVER' | 'SYSTEM'; label: string; driverId: number | null; phone: string | null }
  at: string
  /** Still needs the operator — shown as a banner on top of the order */
  open: boolean
}

/** Alert kinds that mean «a driver did something to this order» — the ones that ring in the console */
export const DRIVER_INCIDENT_ALERTS = ['DRIVER_CANCEL_REQUEST', 'DRIVER_PROBLEM', 'DRIVER_CANCELLED_REDISPATCHED', 'DRIVER_CANCEL_STALLED'] as const

const TITLES: Record<IncidentKind, string> = {
  CANCELLED: 'Պատվերը չեղարկված է',
  DRIVER_CANCEL_REQUEST: 'Վարորդը խնդրում է չեղարկել',
  DRIVER_PROBLEM: 'Վարորդը խնդիր է հայտնել',
  DRIVER_WITHDREW: 'Վարորդը հրաժարվեց, պատվերը վերադարձվեց որոնման',
  CUSTOMER_PENDING: 'Վարորդն ազատվեց հաճախորդի պատճառով․ զանգեք հաճախորդին',
  RELEASED_BY_OPERATOR: 'Օպերատորը հանեց վարորդին',
  SEARCH_FAILED: 'Վարորդ չգտնվեց',
  WAITING_FOR_DRIVER: 'Համապատասխան վարորդները զբաղված են այլ պատվերներով․ սպասում է ազատ վարորդի',
}

const TONES: Record<IncidentKind, IncidentTone> = {
  CANCELLED: 'danger',
  DRIVER_CANCEL_REQUEST: 'warn',
  DRIVER_PROBLEM: 'warn',
  DRIVER_WITHDREW: 'info',
  CUSTOMER_PENDING: 'warn',
  RELEASED_BY_OPERATOR: 'info',
  SEARCH_FAILED: 'warn',
  WAITING_FOR_DRIVER: 'info',
}

export function reasonText(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const code = value.replace(/^DRIVER_CANCELLED:\s*/, '')
  return (CANCEL_REASON_LABEL as Record<string, string>)[code] ?? value
}

function waitingUntil(deadline: unknown): string | null {
  if (typeof deadline !== 'string') return null
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) return null
  return `Կսպասի մինչև ${formatClockTime(d)}, հետո կնշվի «Որոնման ժամկետն անցավ»`
}

/** «Վարորդն ասել է՝ 20 000 ֏ · հաճախորդը՝ 12 000 ֏» — null when the driver gave no price */
export function pricesText(data: Record<string, unknown>): string | null {
  const driver = typeof data.driverPriceAmd === 'number' ? data.driverPriceAmd : null
  const customer = typeof data.customerPriceAmd === 'number' ? data.customerPriceAmd : null
  if (driver === null && customer === null) return null
  return [driver !== null ? `Վարորդն ասել է՝ ${formatPrice(driver)}` : null, customer !== null ? `հաճախորդն առաջարկել է՝ ${formatPrice(customer)}` : null]
    .filter(Boolean)
    .join(' · ')
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function actorOf(event: OpsTimelineEvent, detail: OpsOrderDetail, driverId: number | null): OrderIncident['actor'] {
  if (event.actorType === 'ADMIN') return { type: 'ADMIN', label: 'Օպերատոր', driverId: null, phone: null }
  if (event.actorType === 'SYSTEM') return { type: 'SYSTEM', label: 'Համակարգ', driverId: null, phone: null }
  const id = driverId ?? event.actorId
  const assignment = detail.assignments?.find((a) => a.driverId === id)
  return { type: 'DRIVER', label: assignment?.name ? `Վարորդ՝ ${assignment.name}` : id ? `Վարորդ #${id}` : 'Վարորդ', driverId: id ?? null, phone: assignment?.phone ?? null }
}

export function orderIncidents(detail: OpsOrderDetail): OrderIncident[] {
  const { order, timeline } = detail
  const events = [...timeline].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
  const accepted = events.filter((e) => e.type === 'OFFER_ACCEPTED').map((e) => e.createdAt)
  const offered = events.filter((e) => e.type === 'OFFER_CREATED').map((e) => e.createdAt)
  const finished = order.status === 'COMPLETED' || order.status === 'CANCELLED'
  const incidents: OrderIncident[] = []
  const lastOf = (type: string) => [...events].reverse().find((e) => e.type === type)?.id ?? null

  for (const event of events) {
    const data = event.data ?? {}
    let kind: IncidentKind | null = null
    let open = false
    let driverId: number | null = null
    switch (event.type) {
      case 'ORDER_CANCELLED':
        kind = 'CANCELLED'
        open = order.status === 'CANCELLED' && event.id === lastOf('ORDER_CANCELLED')
        driverId = typeof data.releasedDriverId === 'number' ? data.releasedDriverId : null
        break
      case 'DRIVER_CANCEL_REQUESTED':
        if (data.customer === true) {
          // 2026-11-17: released at once with the fee back; the operator calls the customer
          kind = 'CUSTOMER_PENDING'
          open = order.attentionKind === 'CUSTOMER_PENDING' && event.id === lastOf('DRIVER_CANCEL_REQUESTED')
        } else if (data.redispatch === true) {
          kind = 'DRIVER_WITHDREW'
          // Open until somebody else took the order (or it ended)
          open = !finished && !accepted.some((at) => at > event.createdAt)
        } else {
          kind = 'DRIVER_CANCEL_REQUEST'
          open = order.attentionKind === 'DRIVER_CANCEL_REQUEST' && event.id === lastOf('DRIVER_CANCEL_REQUESTED')
        }
        break
      case 'DRIVER_PROBLEM_REPORTED':
        kind = 'DRIVER_PROBLEM'
        open = order.attentionKind === 'DRIVER_PROBLEM' && event.id === lastOf('DRIVER_PROBLEM_REPORTED')
        break
      case 'ASSIGNMENT_RELEASED':
        // A driver's own withdrawal is already told by DRIVER_CANCEL_REQUESTED
        if (event.actorType === 'ADMIN') {
          kind = 'RELEASED_BY_OPERATOR'
          driverId = typeof data.releasedDriverId === 'number' ? data.releasedDriverId : null
        }
        break
      case 'SEARCH_WAITING':
        // Backend 2026-11-16: every matching driver is busy with another
        // order; the search waits for one (until its deadline). Open until an
        // offer is made or the search ends.
        kind = 'WAITING_FOR_DRIVER'
        open = order.status === 'SEARCHING' && !offered.some((at) => at >= event.createdAt) && event.id === lastOf('SEARCH_WAITING')
        break
      case 'SEARCH_FAILED':
        kind = 'SEARCH_FAILED'
        open = !!order.attentionKind && SEARCH_FAILURE_KINDS.includes(order.attentionKind) && event.id === lastOf('SEARCH_FAILED')
        break
    }
    if (!kind) continue
    const actor =
      kind === 'RELEASED_BY_OPERATOR' || kind === 'CANCELLED'
        ? actorOf(event, detail, null)
        : actorOf(event, detail, driverId)
    incidents.push({
      id: `${event.type}:${event.id}`,
      kind,
      tone: TONES[kind],
      title: TITLES[kind],
      reason: kind === 'WAITING_FOR_DRIVER' ? waitingUntil(data.deadlineAt) : reasonText(data.reason),
      comment: text(data.comment),
      prices: pricesText(data),
      actor,
      at: event.createdAt,
      open,
    })
  }
  return incidents.reverse()
}

export interface ListIncident {
  label: string
  tone: IncidentTone
  /** Needs the operator now — the row goes to the top of the list */
  urgent: boolean
}

const ALERT_CHIP: Record<string, string> = {
  DRIVER_CANCEL_REQUEST: '⚠️ Վարորդը խնդրում է չեղարկել',
  DRIVER_PROBLEM: '⚠️ Վարորդը խնդիր է հայտնել',
  DRIVER_CANCELLED_REDISPATCHED: '🔁 Վարորդը հրաժարվեց',
  DRIVER_CANCEL_STALLED: '⏳ Վարորդը բացել է չեղարկումը և չի ավարտում',
}

export function listIncident(order: OpsOrder, alerts: OpsAlert[]): ListIncident | null {
  const driverAlert = alerts
    .filter((a) => a.orderId === order.id && (DRIVER_INCIDENT_ALERTS as readonly string[]).includes(a.kind))
    // «Call the customer» is over once the order left CUSTOMER_PENDING (a new search, a cancel)
    .filter((a) => !(a.data?.released === true && order.attentionKind !== 'CUSTOMER_PENDING'))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (driverAlert && order.status !== 'CANCELLED' && order.status !== 'COMPLETED') {
    // A customer reason (2026-11-17): the driver is already free — the operator calls the customer
    if (driverAlert.data?.released === true) return { label: '📞 Հաճախորդը կզանգի / հրաժարվեց', tone: 'warn', urgent: true }
    return { label: ALERT_CHIP[driverAlert.kind], tone: driverAlert.kind === 'DRIVER_CANCELLED_REDISPATCHED' ? 'info' : 'warn', urgent: true }
  }
  if (order.status === 'NEEDS_ATTENTION' && order.attentionKind) {
    return { label: `⚠️ ${ATTENTION_LABEL[order.attentionKind as AttentionKind] ?? order.attentionKind}`, tone: 'warn', urgent: true }
  }
  if (order.status === 'CANCELLED') {
    const why = reasonText(order.cancel?.reason) ?? null
    return { label: `❌ Չեղարկված${why ? ` · ${why}` : ''}`, tone: 'danger', urgent: false }
  }
  return null
}
