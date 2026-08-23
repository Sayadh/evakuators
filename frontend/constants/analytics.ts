import type { IconName } from '~/components/common/AppIcon.vue'
import { AnalyticsCard, AnalyticsEventType, AnalyticsPeriod } from '~/types/enums'
import type { SelectOption } from '~/types/common'

/**
 * Analytics labels, card definitions and visitor-id storage settings.
 *
 * Per the project's core architectural decision (see CLAUDE.md), every
 * human-readable Armenian label lives in the frontend — the backend returns
 * bare `AnalyticsEventType` keys and numbers and knows nothing about how a card
 * is titled or ordered. That is also why the DashboardCard definition is here
 * and not in the NestJS module: it is presentation, not data.
 */

/* ── Visitor identity ────────────────────────────────────────────────────── */

/**
 * First-party cookie holding the anonymous visitor id.
 *
 * Written by the browser only (the backend never sets or reads a cookie — the
 * id travels in the request body), so there is exactly one writer and no
 * SSR/Set-Cookie interaction to reason about.
 */
export const VISITOR_ID_COOKIE_NAME = 'ev_visitor_id'

/**
 * Mirror of the same id in localStorage. Both are written, either is accepted.
 *
 * Not redundancy for its own sake: the two are cleared by different user
 * actions and different browser policies (Safari's ITP caps script-written
 * cookie lifetime at 7 days, while "clear site data" wipes localStorage but
 * some privacy tools only prune cookies). Keeping both means a returning
 * visitor is far less likely to be miscounted as new — and when both are gone,
 * they legitimately *are* a new visitor, which is the documented behaviour.
 */
export const VISITOR_ID_STORAGE_KEY = 'evakuators:visitor-id'

/** ~2 years. The id is a random opaque value tied to nothing else. */
export const VISITOR_ID_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 730

/* ── Periods ─────────────────────────────────────────────────────────────── */

export const ANALYTICS_PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  [AnalyticsPeriod.Last7Days]: 'Վերջին 7 օրը',
  [AnalyticsPeriod.Last30Days]: 'Վերջին 30 օրը',
  [AnalyticsPeriod.Last90Days]: 'Վերջին 90 օրը',
}

export const ANALYTICS_PERIOD_OPTIONS: SelectOption[] = Object.values(AnalyticsPeriod).map(
  (period) => ({ value: period, label: ANALYTICS_PERIOD_LABELS[period] }),
)

export const ANALYTICS_DEFAULT_PERIOD = AnalyticsPeriod.Last30Days

/* ── Overview cards ──────────────────────────────────────────────────────── */

export interface AnalyticsCardDefinition {
  id: AnalyticsCard
  label: string
  /** Name from AppIcon's ICONS map — no new icons are introduced by this feature */
  icon: IconName
  /**
   * Which event type's counter this card shows, or null for the derived
   * unique-visitors card (which is not a per-event counter — see
   * docs/analytics.md).
   */
  eventType: AnalyticsEventType | null
  /** One-line explanation shown under the number, so the metric can't be misread */
  hint: string
}

/**
 * Single source of truth for the overview row: order, labels, icons and which
 * number each card reads. The card component iterates this — adding a metric is
 * one entry here, not a new block of markup.
 *
 * ## Why there is no Email card
 *
 * `EMAIL_CLICK` still exists in the enum, in the database and in historical
 * rows, but it can no longer be produced: the email address was removed from
 * the public profile, so there is no button to press and
 * `useAnalyticsTracking().trackEmailClick` has no caller anywhere in the app
 * (grep it). A card for it would show every driver a permanently frozen number
 * under the hint "how many visitors pressed the Email button" — a button they
 * do not have — which reads as "nobody ever emails me" rather than "this
 * channel does not exist". The admin drivers CSV export omits the column for
 * exactly the same reason.
 *
 * The event type is deliberately NOT deleted: whatever was counted before the
 * address was removed is real history, and dropping the enum member would
 * orphan those rows. It simply stops being surfaced.
 */
export const ANALYTICS_OVERVIEW_CARDS: AnalyticsCardDefinition[] = [
  {
    id: AnalyticsCard.PageViews,
    label: 'Դիտումներ',
    icon: 'zoom-in',
    eventType: AnalyticsEventType.PageView,
    hint: 'Քանի անգամ է բացվել ձեր էջը (օրական՝ մեկ այցելու = 1)',
  },
  {
    id: AnalyticsCard.UniqueVisitors,
    label: 'Եզակի այցելուներ',
    icon: 'user',
    eventType: null,
    hint: 'Տարբեր մարդիկ, ովքեր բացել են ձեր էջը ընտրված ժամանակահատվածում',
  },
  {
    id: AnalyticsCard.PhoneClicks,
    label: 'Զանգի սեղմումներ',
    icon: 'phone',
    eventType: AnalyticsEventType.PhoneClick,
    // Same daily-dedup rule as Դիտումներ above, and stated the same way. One
    // person who calls on three different days is 3 here, not 1 — the number
    // is visitor-days, and a hint reading plainly "how many visitors" would
    // have it read as distinct people, which is the Եզակի այցելուներ card.
    hint: 'Քանի անգամ է սեղմվել «Զանգահարել» կոճակը (օրական՝ մեկ այցելու = 1)',
  },
  {
    id: AnalyticsCard.WhatsAppClicks,
    label: 'WhatsApp',
    icon: 'whatsapp',
    eventType: AnalyticsEventType.WhatsAppClick,
    hint: 'Քանի անգամ է սեղմվել WhatsApp-ի կոճակը (օրական՝ մեկ այցելու = 1)',
  },
  {
    id: AnalyticsCard.TelegramClicks,
    label: 'Telegram',
    icon: 'telegram',
    eventType: AnalyticsEventType.TelegramClick,
    hint: 'Քանի անգամ է սեղմվել Telegram-ի կոճակը (օրական՝ մեկ այցելու = 1)',
  },
]

/* ── Chart ───────────────────────────────────────────────────────────────── */

/**
 * Metrics selectable on the daily chart, in display order.
 *
 * No Email line, for the same reason there is no Email card — see
 * ANALYTICS_OVERVIEW_CARDS above. On a chart it would be worse than on a card:
 * a flat line at zero across the whole window reads as a measured result.
 */
export const ANALYTICS_CHART_METRICS: { eventType: AnalyticsEventType; label: string }[] = [
  { eventType: AnalyticsEventType.PageView, label: 'Դիտումներ' },
  { eventType: AnalyticsEventType.PhoneClick, label: 'Զանգեր' },
  { eventType: AnalyticsEventType.WhatsAppClick, label: 'WhatsApp' },
  { eventType: AnalyticsEventType.TelegramClick, label: 'Telegram' },
]

/** Star values for the rating histogram, high → low (how review UIs read) */
export const ANALYTICS_RATING_VALUES_DESC = [5, 4, 3, 2, 1] as const
