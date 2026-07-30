import type { BreadcrumbItem, FaqItem } from '~/types/common'
import type { Review } from '~/types/review'
import type { TowTruck } from '~/types/towTruck'
import { SERVICE_LABELS } from '~/constants/services'
import { SITE_NAME, SITE_URL, SOCIAL_LINKS } from '~/constants/site'
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
 * Stable node ids so the two homepage schemas reference each other instead of
 * repeating themselves. Google treats `@id` as the entity's identity, so the
 * Organization is one thing mentioned twice, not two competing organizations.
 */
const ORGANIZATION_ID = `${SITE_URL}/#organization`
const WEBSITE_ID = `${SITE_URL}/#website`

/**
 * The platform itself as an entity — this is where `sameAs` belongs (not on
 * `WebSite`), because the social profiles identify the *company*.
 *
 * Emit this ONLY on pages that are actually about Evakuators.am (homepage,
 * /about, /contact). Never on `/tow-trucks/[slug]`, where the page's subject
 * is the driver's own business (`buildTowTruckBusinessSchema`) — two
 * business-shaped entities on one page is how reviews and phone numbers get
 * attributed to the wrong one.
 */
export function buildOrganizationSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: SITE_NAME,
    url: SITE_URL,
    // Raster on purpose: Google's logo guidelines want a real image file, and
    // SVG support there is unreliable.
    logo: `${SITE_URL}/evakuators-logo.png`,
    // Same list the footer renders — one constant, so a new network shows up
    // in both places at once.
    ...(SOCIAL_LINKS.length ? { sameAs: SOCIAL_LINKS.map((social) => social.url) } : {}),
  }
}

export function buildWebsiteSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    publisher: { '@id': ORGANIZATION_ID },
  }
}
