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
    hint: 'Քանի այցելու է սեղմել «Զանգահարել» կոճակը',
  },
  {
    id: AnalyticsCard.WhatsAppClicks,
    label: 'WhatsApp',
    icon: 'whatsapp',
    eventType: AnalyticsEventType.WhatsAppClick,
    hint: 'Քանի այցելու է սեղմել WhatsApp-ի կոճակը',
  },
  {
    id: AnalyticsCard.TelegramClicks,
    label: 'Telegram',
    icon: 'telegram',
    eventType: AnalyticsEventType.TelegramClick,
    hint: 'Քանի այցելու է սեղմել Telegram-ի կոճակը',
  },
  {
    id: AnalyticsCard.EmailClicks,
    label: 'Email',
    icon: 'mail',
    eventType: AnalyticsEventType.EmailClick,
    hint: 'Քանի այցելու է սեղմել Email-ի կոճակը',
  },
]

/* ── Chart ───────────────────────────────────────────────────────────────── */

/** Metrics selectable on the daily chart, in display order */
export const ANALYTICS_CHART_METRICS: { eventType: AnalyticsEventType; label: string }[] = [
  { eventType: AnalyticsEventType.PageView, label: 'Դիտումներ' },
  { eventType: AnalyticsEventType.PhoneClick, label: 'Զանգեր' },
  { eventType: AnalyticsEventType.WhatsAppClick, label: 'WhatsApp' },
  { eventType: AnalyticsEventType.TelegramClick, label: 'Telegram' },
  { eventType: AnalyticsEventType.EmailClick, label: 'Email' },
]

/** Star values for the rating histogram, high → low (how review UIs read) */
export const ANALYTICS_RATING_VALUES_DESC = [5, 4, 3, 2, 1] as const
