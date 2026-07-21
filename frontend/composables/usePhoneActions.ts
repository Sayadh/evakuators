import type { TowTruck } from '~/types/towTruck'
import {
  trackEmailClick,
  trackPhoneClick,
  trackTelegramClick,
  trackWhatsAppClick,
} from '~/utils/analytics'
import { getPhoneHref, getTelegramUrl, getWhatsAppUrl } from '~/utils/formatPhone'

/** Call / WhatsApp / Telegram links with analytics tracking for a tow truck */
export function usePhoneActions(truck: MaybeRefOrGetter<TowTruck>) {
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
    onPhoneClick: () => trackPhoneClick(toValue(truck).slug),
    onWhatsAppClick: () => trackWhatsAppClick(toValue(truck).slug),
    onTelegramClick: () => trackTelegramClick(toValue(truck).slug),
    onEmailClick: () => trackEmailClick(toValue(truck).slug),
  }
}
