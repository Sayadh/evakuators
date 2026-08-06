/**
 * The brand, spelled exactly one way, everywhere.
 *
 * The plural `s` is the whole point: a singular `.am` domain one letter away
 * belongs to somebody else, and a search engine that cannot tell the two apart
 * will merge or misattribute them. Never write the name inline — import this,
 * so there is one string to be right about, and so
 * `tests/brandIdentity.spec.ts` can assert the singular form appears nowhere at
 * all. That also keeps the brand distinguishable from the SERVICE word:
 * «էվակուատոր» is what people search for and stays in page copy and titles;
 * `Evakuators.am` is who we are and never replaces it.
 */
export const SITE_NAME = 'Evakuators.am'

/**
 * Canonical origin — HTTPS, no `www`, no trailing slash.
 *
 * Every canonical, `og:url`, sitemap entry and schema `@id` is built from this,
 * so the site can only ever declare one address for a page. nginx 301s the
 * other three forms (http apex, http www, https www) here, which is what makes
 * that declaration true rather than aspirational.
 *
 * No trailing slash so `${SITE_URL}${path}` composes cleanly; where schema.org
 * wants the site root as a URL in its own right, `SITE_URL_ROOT` below adds it.
 */
export const SITE_URL = 'https://evakuators.am'

/** The site root as a standalone URL. schema.org convention is the trailing slash. */
export const SITE_URL_ROOT = `${SITE_URL}/`

/**
 * The one-line positioning statement — brand first, then what it is.
 *
 * Used verbatim as the homepage `<title>` and as the opening of its
 * description, and echoed by the homepage `<h1>`. Leading with the brand is
 * deliberate: it is the single strongest signal that this site is
 * `Evakuators.am` and not a similarly-named competitor, and it is the string an
 * AI summariser is most likely to quote back.
 */
export const SITE_TAGLINE = 'Evakuators.am — Հայաստանի էվակուատորների որոնման հարթակ'

/** Short factual description of the organisation, for schema.org and directories */
export const SITE_ORGANIZATION_DESCRIPTION = 'Հայաստանում էվակուատորների որոնման առցանց հարթակ'

/**
 * Armenian-language alternate name, for `WebSite.alternateName`.
 *
 * A translation of what the site IS, never a second brand and never a rival's
 * name — the field exists so a search for the Armenian phrase resolves to this
 * entity, not so the entity can claim more names.
 */
export const SITE_ALTERNATE_NAME = 'Էվակուատորներ Հայաստան'

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
