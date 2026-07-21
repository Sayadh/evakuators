import { SITE_NAME, SITE_URL } from '~/constants/site'

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

/** Sets title, description, canonical, Open Graph and Twitter metadata for a page */
export function useSeoMetaData(options: SeoPageOptions): void {
  const url = `${SITE_URL}${options.path}`
  const image = options.image ?? `${SITE_URL}/og-image.png`

  useSeoMeta({
    title: options.title,
    description: options.description,
    ...(options.keywords ? { keywords: options.keywords } : {}),
    ogTitle: options.title,
    ogDescription: options.description,
    ogUrl: url,
    ogType: 'website',
    ogSiteName: SITE_NAME,
    ogLocale: 'hy_AM',
    ogImage: image,
    twitterCard: 'summary_large_image',
    twitterTitle: options.title,
    twitterDescription: options.description,
    twitterImage: image,
    ...(options.noindex ? { robots: 'noindex, nofollow' } : {}),
  })

  useHead({
    link: [{ rel: 'canonical', href: url }],
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
