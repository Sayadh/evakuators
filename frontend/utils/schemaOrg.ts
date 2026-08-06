import type { BreadcrumbItem, FaqItem } from '~/types/common'
import type { Review } from '~/types/review'
import type { TowTruck } from '~/types/towTruck'
import { SERVICE_LABELS } from '~/constants/services'
import {
  SITE_ALTERNATE_NAME,
  SITE_NAME,
  SITE_ORGANIZATION_DESCRIPTION,
  SITE_URL,
  SITE_URL_ROOT,
  SOCIAL_LINKS,
} from '~/constants/site'
import { getTowTruckRoute } from './routeHelpers'

type JsonLd = Record<string, unknown>

export function buildBreadcrumbSchema(items: BreadcrumbItem[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.to ? { item: `${SITE_URL}${item.to}` } : {}),
    })),
  }
}

export function buildFaqSchema(items: FaqItem[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}

export function buildTowTruckListSchema(trucks: TowTruck[], listName: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: trucks.length,
    itemListElement: trucks.map((truck, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}${getTowTruckRoute(truck.slug)}`,
      name: truck.companyName ?? truck.driverName,
    })),
  }
}

/** Matches "09:00 – 20:00" / "09:00-20:00" and similar driver-typed variants */
const HOURS_RANGE_PATTERN = /^(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})$/

/**
 * schema.org's `openingHours` needs a strict "Mo-Su HH:MM-HH:MM" format —
 * free-form driver text can't just be dropped in as-is. Only convert it when
 * it actually matches the expected shape; otherwise omit the key entirely
 * rather than publish something Google would flag as invalid structured data.
 */
function toSchemaOpeningHours(workingHours: string | undefined): string | undefined {
  if (!workingHours) return undefined
  const match = workingHours.match(HOURS_RANGE_PATTERN)
  if (!match) return undefined
  const [, startH, startM, endH, endM] = match
  const pad = (value: string) => value.padStart(2, '0')
  return `Mo-Su ${pad(startH)}:${startM}-${pad(endH)}:${endM}`
}

/**
 * `reviews` is optional and empty by default — only pass real approved
 * reviews in. An AggregateRating with 0 reviews is invalid per schema.org
 * and Google explicitly warns against self-reported ratings with no backing
 * review count, so this key is omitted entirely when there's nothing to show.
 */
export function buildTowTruckBusinessSchema(truck: TowTruck, reviews: Review[] = []): JsonLd {
  const schema: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AutomotiveBusiness',
    '@id': `${SITE_URL}${getTowTruckRoute(truck.slug)}`,
    name: truck.companyName ?? truck.driverName,
    url: `${SITE_URL}${getTowTruckRoute(truck.slug)}`,
    telephone: truck.phone,
    image: truck.images,
    description: truck.description,
    areaServed: truck.serviceAreas.map((area) => ({ '@type': 'City', name: area.name })),
    priceRange: '֏֏',
    makesOffer: truck.services.map((service) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: SERVICE_LABELS[service] },
    })),
  }

  // No fake default — only publish real hours (24/7, or a parseable
  // driver-entered range). Previously this always claimed "09:00-21:00" for
  // every non-24/7 truck even when nobody had actually confirmed that.
  const openingHours = truck.works24Hours ? 'Mo-Su 00:00-24:00' : toSchemaOpeningHours(truck.workingHours)
  if (openingHours) schema.openingHours = openingHours

  if (reviews.length > 0) {
    const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: average.toFixed(1),
      reviewCount: reviews.length,
    }
  }

  return schema
}

/**
 * Stable node ids, so the two identity nodes reference each other instead of
 * repeating themselves. Google treats `@id` as the entity's identity, so the
 * Organization is one thing mentioned twice, not two competing organizations.
 *
 * Built from `SITE_URL`, which is the canonical origin — the same string every
 * canonical tag and sitemap entry uses. An `@id` on a different host or scheme
 * would describe a different entity.
 */
const ORGANIZATION_ID = `${SITE_URL}/#organization`
const WEBSITE_ID = `${SITE_URL}/#website`

/**
 * Who this site is, as one `@graph`.
 *
 * ## Why a single graph and not two scripts
 *
 * These were two separate `<script type="application/ld+json">` blocks. Both
 * were valid and they already cross-referenced by `@id`, but a consumer that
 * reads only the first block — which several do, including some AI crawlers —
 * saw an Organization with no site, or a WebSite with no publisher. A `@graph`
 * makes the pair indivisible: one script, one `@context`, two nodes that
 * arrive together or not at all.
 *
 * ## Why this matters more than usual here
 *
 * A domain one letter away from ours belongs to somebody else. Structured data
 * is the strongest machine-readable statement we can make that this entity is
 * `Evakuators.am`, with these social profiles, this logo and this URL — which
 * is what stops the two being merged or confused. The brand is written from
 * `SITE_NAME` for the same reason it is everywhere else: one string to be
 * right about.
 *
 * ## Where it may be emitted
 *
 * ONLY on pages that are actually about the platform — today, the homepage.
 * Never on `/tow-trucks/[slug]`, where the page's subject is the driver's own
 * business (`buildTowTruckBusinessSchema`): two business-shaped entities on one
 * page is how reviews and phone numbers get attributed to the wrong one.
 */
export function buildSiteIdentitySchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ORGANIZATION_ID,
        name: SITE_NAME,
        url: SITE_URL_ROOT,
        description: SITE_ORGANIZATION_DESCRIPTION,
        // ImageObject rather than a bare URL string: both are valid, but the
        // object form is what Google's logo documentation shows, and it leaves
        // room for width/height later without changing the shape.
        //
        // Raster on purpose — Google's logo guidelines want a real image file
        // and its SVG support is unreliable.
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}/evakuators-logo.png`,
        },
        // The same list the footer renders, so a network added in one place
        // appears in both. Never hand-written here: an invented or dead profile
        // URL is worse than none, because `sameAs` is read as a claim of
        // identity and a wrong one points the entity at somebody else.
        ...(SOCIAL_LINKS.length ? { sameAs: SOCIAL_LINKS.map((social) => social.url) } : {}),
      },
      {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        url: SITE_URL_ROOT,
        name: SITE_NAME,
        // A translation of what the site is, not a second brand — see
        // SITE_ALTERNATE_NAME.
        alternateName: SITE_ALTERNATE_NAME,
        publisher: { '@id': ORGANIZATION_ID },
        inLanguage: 'hy-AM',
      },
    ],
  }
}
