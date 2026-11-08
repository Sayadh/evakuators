/**
 * Armenian words for the live dispatch console. The backend sends codes; this
 * file is the one place they become text (same rule as profileChangeLabels.ts).
 */
import type { AttentionKind, CancelReason, OpsAvailability, OrderStatus, PaymentStatus } from '~/types/opsDispatch'

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: 'Սևագիր',
  SEARCHING: 'Վարորդի որոնում',
  PRICE_CONFIRMATION_PENDING: 'Գինը հաստատման փուլում',
  ASSIGNED: 'Նշանակված',
  EN_ROUTE_TO_PICKUP: 'Ճանապարհին',
  ARRIVED_AT_PICKUP: 'Տեղում է',
  TRANSPORTING: 'Տեղափոխում',
  COMPLETED: 'Ավարտված',
  NEEDS_ATTENTION: 'Պահանջում է ուշադրություն',
  CANCELLED: 'Չեղարկված',
}

export const ORDER_STATUS_VARIANT: Record<OrderStatus, 'success' | 'accent' | 'primary' | 'neutral' | 'danger'> = {
  DRAFT: 'neutral',
  SEARCHING: 'accent',
  PRICE_CONFIRMATION_PENDING: 'accent',
  ASSIGNED: 'primary',
  EN_ROUTE_TO_PICKUP: 'primary',
  ARRIVED_AT_PICKUP: 'primary',
  TRANSPORTING: 'primary',
  COMPLETED: 'success',
  NEEDS_ATTENTION: 'danger',
  CANCELLED: 'neutral',
}

export const ATTENTION_LABEL: Record<AttentionKind, string> = {
  SEARCH_EXHAUSTED: 'Համապատասխան վարորդ չգտնվեց',
  SEARCH_TIMEOUT: 'Որոնման ժամկետն անցավ',
  MANUAL_OFFER_FAILED: 'Ձեռքով առաջարկը չընդունվեց',
  DRIVER_CANCEL_REQUEST: 'Վարորդը խնդրում է չեղարկել (դեռ նշանակված է)',
  DRIVER_PROBLEM: 'Վարորդը խնդիր է հայտնել',
  OPERATOR_FLAG: 'Նշված է օպերատորի կողմից',
}

/** Attention kinds where NO driver is attached — a new search is allowed */
export const SEARCH_FAILURE_KINDS: AttentionKind[] = ['SEARCH_EXHAUSTED', 'SEARCH_TIMEOUT', 'MANUAL_OFFER_FAILED']

export const CANCEL_REASON_LABEL: Record<CancelReason, string> = {
  DRIVER_CANNOT_PERFORM: 'Վարորդը չի կարող կատարել',
  CUSTOMER_DECLINED: 'Հաճախորդը հրաժարվել է',
  WRONG_DATA: 'Սխալ տվյալներ',
  PRICE_NOT_AGREED: 'Գինը չի համաձայնեցվել',
  TECHNICAL_PROBLEM: 'Տեխնիկական խնդիր',
  OTHER: 'Այլ (մեկնաբանությամբ)',
}

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  UNKNOWN: 'Անհայտ',
  UNPAID: 'Չվճարված',
  PAID: 'Վճարված',
}

export const OFFER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Սպասում է պատասխանի',
  ACCEPTED: 'Ընդունված',
  REJECTED: 'Մերժված',
  EXPIRED: 'Ժամկետանց',
  REVOKED: 'Հետ կանչված',
}

export const REASON_LABEL: Record<string, string> = {
  INACTIVE: 'Ապաակտիվացված',
  SUSPENDED: 'Կասեցված բաշխումից',
  NO_TRACKING_CONSENT: 'Չկա հետևման համաձայնություն',
  OFFLINE_BY_CHOICE: 'Անջատել է պատվերները',
  CONNECTION_STALE: 'Կապ չկա',
  GPS_MISSING: 'GPS չկա',
  GPS_STALE: 'GPS-ը հին է',
  GPS_INACCURATE: 'GPS-ը անճշգրիտ է',
  GPS_SUSPICIOUS: 'GPS-ը կասկածելի է',
  RESERVED: 'Այլ առաջարկ է դիտում',
  ON_ORDER: 'Ակտիվ պատվերով',
  EXTERNAL_BUSY: 'Զբաղված է այլ պատվերով',
}

export const ALERT_LABEL: Record<string, string> = {
  SEARCH_SLOW: 'Որոնումը տևում է 90 վ-ից ավելի',
  SEARCH_FAILED: 'Որոնումը ձախողվեց',
  ACTIVE_GPS_LOST: 'Ակտիվ պատվերի վարորդի GPS-ը կորել է',
  DRIVER_NOT_MOVING: 'Վարորդը չի սեղմել «Շարժվում եմ»',
  DRIVER_CANCEL_REQUEST: 'Վարորդը խնդրում է չեղարկել',
  DRIVER_PROBLEM: 'Վարորդը խնդիր է հայտնել',
}

export const ERROR_LABEL: Record<string, string> = {
  VERSION_CONFLICT: 'Պատվերն արդեն փոխվել է մեկ ուրիշի կողմից։ Էջը թարմացվեց — ստուգեք և կրկնեք։',
  REQUIREMENTS_UNCONFIRMED: 'Տեխնիկական պահանջները ճշտված չեն։ Լրացրեք կամ հաստատեք override-ով։',
  PRICE_REQUIRED: 'Ֆիքսված գնով պատվերի համար գինը պարտադիր է։',
  DRIVER_BUSY: 'Վարորդն արդեն ունի ակտիվ պատվեր։',
  DRIVER_RESERVED: 'Վարորդն այս պահին այլ առաջարկ է դիտում։',
  DRIVER_UNAVAILABLE: 'Վարորդը հասանելի չէ։',
  CAPABILITY_MISMATCH: 'Մեքենան չի համապատասխանում պատվերին։',
  INVALID_TRANSITION: 'Այս գործողությունը պատվերի ներկա վիճակում թույլատրված չէ։',
  FEATURE_DISABLED: 'Ավտոմատ բաշխումը դեռ միացված չէ (LIVE_DISPATCH_ENABLED)։',
}

/** One short line an operator reads at a glance */
export function availabilitySummary(a: OpsAvailability): { text: string; tone: 'ok' | 'warn' | 'off' } {
  if (a.eligible) return { text: 'Ազատ է, պատրաստ', tone: 'ok' }
  if (a.occupancy === 'ON_ORDER') return { text: 'Ակտիվ պատվերով', tone: 'warn' }
  if (a.occupancy === 'RESERVED') return { text: 'Առաջարկ է դիտում', tone: 'warn' }
  const first = a.reasons[0]
  return { text: first ? (REASON_LABEL[first] ?? first) : 'Հասանելի չէ', tone: a.preference === 'OFFLINE' ? 'off' : 'warn' }
}

/** "4.1 կմ" — never a straight line passed off as a road figure; the caller labels which one it is */
export function formatMeters(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return '—'
  return meters < 1000 ? `${Math.round(meters)} մ` : `${(meters / 1000).toFixed(1)} կմ`
}

export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—'
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes < 60 ? `${minutes} րոպե` : `${Math.floor(minutes / 60)} ժ ${minutes % 60} ր`
}

export function formatAge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return 'երբեք'
  if (seconds < 60) return `${seconds} վ առաջ`
  if (seconds < 3600) return `${Math.round(seconds / 60)} ր առաջ`
  return `${Math.round(seconds / 3600)} ժ առաջ`
}

/** "+37491000001" → "+374 91 00 00 01" for reading on the phone */
export function formatArmenianPhone(phone: string): string {
  const m = /^\+374(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(phone)
  return m ? `+374 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone
}

/** The API error code of a failed $fetch, if any */
export function apiErrorCode(error: unknown): string | null {
  const data = (error as { data?: { code?: unknown } })?.data
  return typeof data?.code === 'string' ? data.code : null
}

export function apiErrorText(error: unknown, fallback: string): string {
  const code = apiErrorCode(error)
  if (code && ERROR_LABEL[code]) return ERROR_LABEL[code]
  const message = (error as { data?: { message?: unknown } })?.data?.message
  return typeof message === 'string' ? message : fallback
}
