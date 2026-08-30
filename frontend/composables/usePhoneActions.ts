import type { TowTruckContactable } from '~/types/towTruck'
import { trackPhoneClick, trackTelegramClick, trackWhatsAppClick } from '~/utils/analytics'
import { getPhoneHref, getTelegramUrl, getWhatsAppUrl } from '~/utils/formatPhone'
import { trackMetaPixelContact } from '~/utils/trackMetaPixelContact'

/**
 * Call / WhatsApp / Telegram links plus the tracking that goes with them.
 *
 * This is the single place every contact action in the app funnels through
 * (profile page, mobile sticky bar, cards), which is exactly why the analytics
 * calls live here and not in the components: a new place to press "call" gets
 * counted automatically, and there is no way to add a contact button that
 * silently isn't tracked.
 *
 * Each handler fires up to three independent trackers, on purpose:
 * - `utils/analytics.ts` — external product analytics (GA/Matomo), keyed by slug
 * - `useAnalyticsTracking` — this driver's own dashboard counters, keyed by id,
 *   deduplicated to once per visitor per calendar day (see docs/analytics.md)
 * - `trackMetaPixelContact` — Meta's `Contact` ad-conversion event, WhatsApp
 *   only (not Telegram: no ad campaign optimizes on it today). NOT phone:
 *   `plugins/meta-pixel.client.ts` already tracks every `tel:` link click
 *   itself, via a single document-level listener (`trackContact`), so
 *   calling `trackMetaPixelContact` here too for `onPhoneClick` would send
 *   Meta two `Contact` events for the same one click. WhatsApp has no such
 *   listener — its link isn't a `tel:` href — so it still needs firing
 *   here. Already a no-op unless the Pixel actually loaded — see that file.
 */
export function usePhoneActions(truck: MaybeRefOrGetter<TowTruckContactable>) {
  const analytics = useAnalyticsTracking()
  const phoneHref = computed(() => getPhoneHref(toValue(truck).phone))

  const secondaryPhoneHref = computed(() => {
    const value = toValue(truck)
    return value.secondaryPhone ? getPhoneHref(value.secondaryPhone) : null
  })

  const whatsappUrl = computed(() => {
    const value = toValue(truck)
    return value.whatsapp ? getWhatsAppUrl(value.whatsapp) : null
  })

  const telegramUrl = computed(() => {
    const value = toValue(truck)
    return value.telegram ? getTelegramUrl(value.telegram) : null
  })

  return {
    phoneHref,
    secondaryPhoneHref,
    whatsappUrl,
    telegramUrl,
    onPhoneClick: (): void => {
      const value = toValue(truck)
      trackPhoneClick(value.slug)
      analytics.trackPhoneClick(value.id)
      // No Meta Pixel call here on purpose — see the doc comment above:
      // the plugin's own document-level tel: listener already covers it.
    },
    onWhatsAppClick: (): void => {
      const value = toValue(truck)
      trackWhatsAppClick(value.slug)
      analytics.trackWhatsAppClick(value.id)
      trackMetaPixelContact(value.slug)
    },
    onTelegramClick: (): void => {
      const value = toValue(truck)
      trackTelegramClick(value.slug)
      analytics.trackTelegramClick(value.id)
    },
  }
}
