export const SITE_NAME = 'Evakuators.am'
export const SITE_URL = 'https://evakuators.am'
export const SITE_DESCRIPTION =
  'Գտեք Հայաստանի ցանկացած մարզում և Երևանի վարչական շրջաններում աշխատող էվակուատորներ։ Դիտեք մեքենաների նկարները, ծառայությունները, գները և անմիջապես զանգահարեք վարորդին։'

/**
 * The platform's single contact number. Phone, WhatsApp and Telegram are all
 * derived from it — see `getPhoneHref`, `getWhatsAppUrl` and
 * `getTelegramPhoneUrl` — so there is exactly one string to change when it
 * moves, and the three links can never point at different numbers.
 */
export const CONTACT_PHONE = '+374 77 13 54 66'

/**
 * Single source of truth for the platform's social profiles — same
 * constants-only pattern as everything else here (see docs/taxonomies.md).
 * Add a network by adding one entry: the footer renders the list, and
 * `buildWebSiteSchema()` publishes the same URLs as schema.org `sameAs`,
 * so the two can't drift apart.
 */
export interface SocialLink {
  /** Must be a valid `IconName` in `components/common/AppIcon.vue` */
  icon: 'facebook' | 'instagram' | 'tiktok'
  label: string
  url: string
}

export const SOCIAL_LINKS: SocialLink[] = [
  { icon: 'facebook', label: 'Facebook', url: 'https://www.facebook.com/evakuators.am' },
  { icon: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/evakuators.am' },
  { icon: 'tiktok', label: 'TikTok', url: 'https://www.tiktok.com/@evakuators.am' },
]
