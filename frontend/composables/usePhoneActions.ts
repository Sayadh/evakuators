import type { TowTruck } from '~/types/towTruck'
import {
  trackEmailClick,
  trackPhoneClick,
  trackTelegramClick,
  trackWhatsAppClick,
} from '~/utils/analytics'
import { getPhoneHref, getTelegramUrl, getWhatsAppUrl } from '~/utils/formatPhone'

/**
 * Call / WhatsApp / Telegram / Email links plus the tracking that goes with them.
 *
 * This is the single place every contact action in the app funnels through
 * (profile page, mobile sticky bar, cards), which is exactly why the analytics
 * calls live here and not in the components: a new place to press "call" gets
 * counted automatically, and there is no way to add a contact button that
 * silently isn't tracked.
 *
 * Each handler fires two independent trackers, on purpose:
 * - `utils/analytics.ts` — external product analytics (GA/Matomo), keyed by slug
 * - `useAnalyticsTracking` — this driver's own dashboard counters, keyed by id,
 *   deduplicated to once per visitor per calendar day (see docs/analytics.md)
 */
export function usePhoneActions(truck: MaybeRefOrGetter<TowTruck>) {
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

  const emailHref = computed(() => {
    const value = toValue(truck)
    return value.email ? `mailto:${value.email}` : null
  })

  return {
    phoneHref,
    secondaryPhoneHref,
    whatsappUrl,
    telegramUrl,
    emailHref,
    onPhoneClick: (): void => {
      const value = toValue(truck)
      trackPhoneClick(value.slug)
      analytics.trackPhoneClick(value.id)
    },
    onWhatsAppClick: (): void => {
      const value = toValue(truck)
      trackWhatsAppClick(value.slug)
      analytics.trackWhatsAppClick(value.id)
    },
    onTelegramClick: (): void => {
      const value = toValue(truck)
      trackTelegramClick(value.slug)
      analytics.trackTelegramClick(value.id)
    },
    onEmailClick: (): void => {
      const value = toValue(truck)
      trackEmailClick(value.slug)
      analytics.trackEmailClick(value.id)
    },
  }
}
