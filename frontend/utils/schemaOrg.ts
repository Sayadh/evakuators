import type { BreadcrumbItem, FaqItem } from '~/types/common'
import type { Review } from '~/types/review'
import type { TowTruck } from '~/types/towTruck'
import { SERVICE_LABELS } from '~/constants/services'
import { SITE_NAME, SITE_URL } from '~/constants/site'
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

export function buildWebsiteSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
  }
}
