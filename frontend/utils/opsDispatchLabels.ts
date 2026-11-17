/**
 * Armenian words for the live dispatch console. The backend sends codes; this
 * file is the one place they become text (same rule as profileChangeLabels.ts).
 */
import type { AttentionKind, CancelReason, OpsAvailability, OrderStatus, PaymentStatus, PickupPrecision } from '~/types/opsDispatch'

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
  CUSTOMER_PENDING: 'Սպասում է հաճախորդի որոշմանը (վարորդն ազատված է)',
}

/** Attention kinds that mean «the search failed» */
export const SEARCH_FAILURE_KINDS: AttentionKind[] = ['SEARCH_EXHAUSTED', 'SEARCH_TIMEOUT', 'MANUAL_OFFER_FAILED']

/**
 * Attention kinds where NO driver is attached — a new search or a manual offer
 * is allowed. Mirrors DRIVERLESS_ATTENTION_KINDS in backend order-state.ts.
 */
export const DRIVERLESS_ATTENTION_KINDS: AttentionKind[] = [...SEARCH_FAILURE_KINDS, 'CUSTOMER_PENDING']

/** Reasons only a driver sends; the operator's cancel form does not offer them (the API refuses them) */
export const DRIVER_ONLY_CANCEL_REASONS: CancelReason[] = ['NOT_SPECIFIED', 'CUSTOMER_WILL_CALL']

export const CANCEL_REASON_LABEL: Record<CancelReason, string> = {
  DRIVER_CANNOT_PERFORM: 'Վարորդը չի կարող կատարել',
  CUSTOMER_DECLINED: 'Հաճախորդը հրաժարվել է',
  WRONG_DATA: 'Սխալ տվյալներ',
  PRICE_NOT_AGREED: 'Գինը չի համաձայնեցվել',
  TECHNICAL_PROBLEM: 'Տեխնիկական խնդիր',
  OTHER: 'Այլ (մեկնաբանությամբ)',
  NOT_SPECIFIED: 'Պատճառը չնշվեց',
  CUSTOMER_WILL_CALL: 'Հաճախորդը կզանգի (մտածում է)',
}

/** Pickup precision (2026-11-17) — the same words the driver app shows */
export const PICKUP_PRECISION_LABEL: Record<PickupPrecision, string> = {
  EXACT: '✅ Հաստատված կետ',
  APPROXIMATE: '⚠️ Մոտավոր կետ',
}
export const PICKUP_PRECISION_HINT: Record<PickupPrecision, string> = {
  EXACT: 'Հաճախորդն ուղարկել է իր տեղադրությունը կամ հասցեն ճշգրիտ է',
  APPROXIMATE: 'Մոտավոր է․ վարորդը տեղը կճշտի հաճախորդի հետ',
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
  DRIVER_CANCELLED_REDISPATCHED: 'Վարորդը հրաժարվեց, պատվերն ավտոմատ փոխանցվեց այլ վարորդի',
  DRIVER_PROBLEM: 'Վարորդը խնդիր է հայտնել',
  PRICE_REVIEW: 'Վարորդը գրել է նվազագույն գինը — զանգեք հաճախորդին',
  DRIVER_CANCEL_STALLED: 'Վարորդը 3 րոպե է բացել է չեղարկման էջը և չի ուղարկում — զանգեք վարորդին',
}

/**
 * One alert in words. DRIVER_CANCEL_REQUEST with `released` (2026-11-17) is a
 * driver who backed out for a CUSTOMER reason and is already free — not a
 * request waiting for an answer.
 */
export function alertLabel(alert: { kind: string; data?: Record<string, unknown> | null }): string {
  if (alert.kind === 'DRIVER_CANCEL_REQUEST' && alert.data?.released === true) return 'Վարորդն ազատվեց․ հաճախորդը կզանգի կամ հրաժարվեց — զանգեք հաճախորդին'
  return ALERT_LABEL[alert.kind] ?? alert.kind
}

export const ERROR_LABEL: Record<string, string> = {
  PRICE_REVIEW_NOT_FOUND: 'Գնի ստուգումն արդեն որոշված է։ Էջը թարմացվեց։',
  PRICE_TOO_LOW_FOR_DISTANCE: 'Այս հեռավորության պատվերը չի կարող լինել նվազագույն գնով։',
  VERSION_CONFLICT: 'Պատվերն արդեն փոխվել է մեկ ուրիշի կողմից։ Էջը թարմացվեց — ստուգեք և կրկնեք։',
  REQUIREMENTS_UNCONFIRMED: 'Տեխնիկական պահանջները ճշտված չեն։ Լրացրեք կամ հաստատեք override-ով։',
  PRICE_REQUIRED: 'Ֆիքսված գնով պատվերի համար գինը պարտադիր է։',
  PICKUP_LOCATION_REQUIRED: 'Ավտոմատ որոնման համար պետք են վերցնելու կետի կոորդինատները։ Առանց կոորդինատների պատվերն ուղարկեք կոնկրետ վարորդի ձեռքով։',
  DRIVER_BUSY: 'Վարորդն արդեն ունի ակտիվ պատվեր։',
  DRIVER_RESERVED: 'Վարորդն այս պահին այլ առաջարկ է դիտում։',
  DRIVER_UNAVAILABLE: 'Վարորդը հասանելի չէ։',
  CAPABILITY_MISMATCH: 'Մեքենան չի համապատասխանում պատվերին։',
  INVALID_TRANSITION: 'Այս գործողությունը պատվերի ներկա վիճակում թույլատրված չէ։',
  FEATURE_DISABLED: 'Ավտոմատ բաշխումը դեռ միացված չէ (LIVE_DISPATCH_ENABLED)։',
  PRE_ORDER_NOT_FOUND: 'Նախապատվերը չի գտնվել։',
  PRE_ORDER_CLOSED: 'Նախապատվերն արդեն փակված է։',
  PRE_ORDER_NOTIFY_TOO_SOON: 'Վարորդներին արդեն ծանուցել եք քիչ առաջ․ կրկին կարող եք 2 րոպեից։',
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

/**
 * What exactly was wrong, field by field (2026-11-12): the server's
 * VALIDATION_FAILED carries `details.issues[{ path }]` — said in words here,
 * never just «Տվյալները սխալ են».
 */
const FIELD_PROBLEM: [RegExp, string][] = [
  [/^customerPhone/, 'Հաճախորդի հեռախոսը սխալ է. գրեք +374XXXXXXXX կամ 0XXXXXXXX ձևով'],
  [/^customerName/, 'Հաճախորդի անունը շատ երկար է (առավելագույնը 120 նիշ)'],
  [/^pickup\.address/, 'Գրեք վերցնելու հասցեն (առնվազն 2 նիշ)'],
  [/^pickup/, 'Վերցնելու կետի կոորդինատները սխալ են կամ Հայաստանից դուրս են'],
  [/^destination\.address/, 'Հասցման հասցեն սխալ է'],
  [/^destination/, 'Հասցման կետի կոորդինատները սխալ են կամ Հայաստանից դուրս են'],
  [/^vehicle\.weightKg/, 'Քաշը պետք է լինի 100-ից 60 000 կգ'],
  [/^vehicle\.plate/, 'Համարանիշը շատ երկար է'],
  [/^vehicle/, 'Մեքենայի տվյալները սխալ են (մակնիշ/մոդել՝ առավելագույնը 60 նիշ)'],
  [/^problemDescription/, 'Խնդրի նկարագրությունը շատ երկար է (առավելագույնը 2000 նիշ)'],
  [/^requirements\.wheelSkatesCount/, 'Ռոլիկների քանակը պետք է լինի 1-ից 4'],
  [/^pricing\.quotedPriceAmd/, 'Գինը պետք է լինի ամբողջ թիվ՝ 0-ից 10 000 000 ֏'],
  [/^pricing/, 'Ընտրեք գնի տեսակը'],
  [/^internalNote/, 'Ներքին նշումը շատ երկար է (առավելագույնը 2000 նիշ)'],
]

function validationProblems(error: unknown): string | null {
  const details = (error as { data?: { details?: { issues?: { path?: string }[]; field?: string } } })?.data?.details
  const paths = [...(details?.issues ?? []).map((issue) => issue.path ?? ''), ...(details?.field ? [details.field] : [])]
  const said = new Set<string>()
  for (const path of paths) {
    const hit = FIELD_PROBLEM.find(([pattern]) => pattern.test(path))
    said.add(hit ? hit[1] : `Սխալ դաշտ՝ ${path || 'անհայտ'}`)
  }
  return said.size ? [...said].join('։ ') + '։' : null
}

export function apiErrorText(error: unknown, fallback: string): string {
  const code = apiErrorCode(error)
  if (code === 'VALIDATION_FAILED') {
    const problems = validationProblems(error)
    if (problems) return problems
  }
  if (code && ERROR_LABEL[code]) return ERROR_LABEL[code]
  const message = (error as { data?: { message?: unknown } })?.data?.message
  return typeof message === 'string' ? message : fallback
}
