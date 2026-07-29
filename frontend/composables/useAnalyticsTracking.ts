import { analyticsRepository, isApiEnabled } from '~/repositories'
import { AnalyticsEventType, SiteEventType } from '~/types/enums'
import { getOrCreateVisitorId } from '~/utils/visitorId'

/**
 * Site-wide events already sent in THIS page session.
 *
 * Module scope, not component state, so it survives client-side navigation —
 * without it, a visitor clicking through five pages would fire five SITE_VISIT
 * requests where four are guaranteed server-side no-ops (the dedup constraint
 * already collapses them to one per calendar day). The DB would be correct
 * either way; this just stops us paying for four pointless round-trips per
 * visitor. Reset naturally on a full page load, which is the point: it is a
 * request-saving cache, never the source of truth for "has this counted".
 */
const sentSiteEvents = new Set<SiteEventType>()

/**
 * Records a visitor interaction with a tow truck's profile for that driver's
 * own dashboard (see docs/analytics.md).
 *
 * This is INTERNAL, per-provider analytics and is deliberately separate from
 * `utils/analytics.ts`, which is the abstraction over an external product
 * analytics tool (GA/Matomo). The two answer different questions for different
 * audiences — "how is my listing performing" for one driver, versus "how is the
 * site performing" for us — and only this one writes to our own database.
 *
 * ## Three rules this composable enforces so no caller has to remember them
 *
 * 1. **Client only.** A page view is an act of a browser; SSR must never record
 *    one, or every crawl and every server render would count as a visit.
 * 2. **Never breaks the page.** Failures are swallowed. A visitor pressing
 *    "Զանգահարել" must reach the phone dialer whether or not our stats endpoint
 *    is reachable, so nothing here is awaited by the caller and nothing throws.
 * 3. **Respects the mock/API switch.** With `NUXT_PUBLIC_API_BASE_URL` empty the
 *    whole site runs on fixtures and there is no backend to post to; tracking
 *    then does nothing at all rather than logging failed requests to the console
 *    on every click.
 */
export function useAnalyticsTracking() {
  function trackEvent(towTruckId: number, eventType: AnalyticsEventType): void {
    if (!import.meta.client || !isApiEnabled()) return

    const visitorId = getOrCreateVisitorId()
    if (!visitorId) return

    // Intentionally not awaited: the click handler that called this is usually
    // about to hand the browser off to tel:/mailto:/a new tab, and blocking that
    // on a network round-trip would be user-visible latency for a counter.
    void analyticsRepository
      .trackEvent({ towTruckId, eventType, visitorId })
      .catch(() => {
        // Analytics must never surface an error to a visitor. Repeated events
        // are no-ops server-side anyway, so a dropped one costs at most one
        // uncounted interaction.
      })
  }

  /**
   * Site-wide counterpart, for the admin panel's own traffic numbers. Same
   * three rules as trackEvent (client only, never breaks the page, respects
   * the mock switch) plus the per-session guard above.
   */
  function trackSiteEvent(eventType: SiteEventType): void {
    if (!import.meta.client || !isApiEnabled()) return
    if (sentSiteEvents.has(eventType)) return

    const visitorId = getOrCreateVisitorId()
    if (!visitorId) return

    sentSiteEvents.add(eventType)
    void analyticsRepository.trackSiteEvent({ eventType, visitorId }).catch(() => {
      // Same as above: a visitor must never see an analytics failure. Allow a
      // retry on the next page load rather than silently marking it sent.
      sentSiteEvents.delete(eventType)
    })
  }

  return {
    trackEvent,
    trackSiteEvent,
    /** "Someone opened the site" — fired once per page session from app.vue */
    trackSiteVisit: (): void => trackSiteEvent(SiteEventType.SiteVisit),
    /** "Someone opened Ազատ երթուղիներ" — fired from the /free-routes page */
    trackFreeRoutesView: (): void => trackSiteEvent(SiteEventType.FreeRoutesView),
    trackPageView: (towTruckId: number): void =>
      trackEvent(towTruckId, AnalyticsEventType.PageView),
    trackPhoneClick: (towTruckId: number): void =>
      trackEvent(towTruckId, AnalyticsEventType.PhoneClick),
    trackWhatsAppClick: (towTruckId: number): void =>
      trackEvent(towTruckId, AnalyticsEventType.WhatsAppClick),
    trackTelegramClick: (towTruckId: number): void =>
      trackEvent(towTruckId, AnalyticsEventType.TelegramClick),
    trackEmailClick: (towTruckId: number): void =>
      trackEvent(towTruckId, AnalyticsEventType.EmailClick),
  }
}
