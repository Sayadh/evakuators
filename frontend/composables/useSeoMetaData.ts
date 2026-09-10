import { SITE_NAME, SITE_URL } from '~/constants/site'

/** Open Graph spells locales with an underscore, unlike `hreflang`'s hyphen */
const OG_LOCALES: Record<string, string> = {
  hy: 'hy_AM',
  ru: 'ru_RU',
  en: 'en_US',
}

interface SeoPageOptions {
  title: string
  description: string
  /** Path starting with "/" — used for canonical and og:url */
  path: string
  /** Comma-separated keywords (Armenian + transliterated variants) */
  keywords?: string
  image?: string
  noindex?: boolean
}

/**
 * Sets title, description, canonical, Open Graph, Twitter and `hreflang` for a
 * page.
 *
 * ## Why the canonical is built here and not taken from `options.path`
 *
 * `path` is the Armenian URL — the one every page has hard-coded — and the
 * canonical has to be the URL of the version actually being rendered. Left
 * as-is, all three language versions of a page would name the Armenian one as
 * canonical, which tells Google to index one and drop the other two. That is
 * the single most expensive mistake available in a multilingual site, and it
 * fails silently: the pages render perfectly and simply never rank.
 *
 * `useLocalePath` is what turns `/regions/kotayk/abovyan` into
 * `/ru/regions/kotayk/abovyan` for the current locale.
 *
 * ## `hreflang`
 *
 * One `<link rel="alternate">` per language, plus `x-default` pointing at the
 * Armenian version. This is what tells a search engine the three URLs are the
 * same page in three languages rather than duplicates competing with each
 * other — and it is why `baseUrl` is set in the i18n config: relative hreflang
 * URLs are ignored.
 *
 * Emitted for every page that calls this, including `noindex` ones. That is
 * harmless and simpler than a rule about which pages get it: a page telling
 * crawlers not to index it is not asking them to choose between versions
 * either.
 */
export function useSeoMetaData(options: SeoPageOptions): void {
  const localePath = useLocalePath()
  const { locale, locales } = useI18n()

  const url = `${SITE_URL}${localePath(options.path)}`
  const image = options.image ?? `${SITE_URL}/og-image.png`

  const alternates = (locales.value as { code: string; language?: string }[]).map((entry) => ({
    code: entry.code,
    hreflang: entry.language ?? entry.code,
    href: `${SITE_URL}${localePath(options.path, entry.code as 'hy' | 'ru' | 'en')}`,
  }))
  const armenian = alternates.find((entry) => entry.code === 'hy')

  useSeoMeta({
    title: options.title,
    description: options.description,
    ...(options.keywords ? { keywords: options.keywords } : {}),
    ogTitle: options.title,
    ogDescription: options.description,
    ogUrl: url,
    ogType: 'website',
    ogSiteName: SITE_NAME,
    // The locale actually being rendered, in Facebook's underscore form — a
    // Russian page announcing `hy_AM` is telling every scraper that reads Open
    // Graph the opposite of what the page says.
    ogLocale: OG_LOCALES[locale.value] ?? 'hy_AM',
    ogLocaleAlternate: Object.entries(OG_LOCALES)
      .filter(([code]) => code !== locale.value)
      .map(([, value]) => value),
    ogImage: image,
    twitterCard: 'summary_large_image',
    twitterTitle: options.title,
    twitterDescription: options.description,
    twitterImage: image,
    ...(options.noindex ? { robots: 'noindex, nofollow' } : {}),
  })

  useHead({
    link: [
      { rel: 'canonical', href: url },
      ...alternates.map((entry) => ({
        rel: 'alternate',
        hreflang: entry.hreflang,
        href: entry.href,
      })),
      // Whoever does not match a listed language gets Armenian: this is an
      // Armenian business, and the Russian and English versions exist to be
      // found by people searching in those languages, not to be the default for
      // everyone else.
      ...(armenian ? [{ rel: 'alternate', hreflang: 'x-default', href: armenian.href }] : []),
    ],
  })
}

/** Injects JSON-LD structured data scripts into the page head */
export function useJsonLd(schemas: Array<Record<string, unknown>>): void {
  useHead({
    script: schemas.map((schema) => ({
      type: 'application/ld+json',
      innerHTML: JSON.stringify(schema),
    })),
  })
}
