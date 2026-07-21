import type { BreadcrumbItem, FaqItem } from '~/types/common'
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

export function buildTowTruckBusinessSchema(truck: TowTruck): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'AutomotiveBusiness',
    '@id': `${SITE_URL}${getTowTruckRoute(truck.slug)}`,
    name: truck.companyName ?? truck.driverName,
    url: `${SITE_URL}${getTowTruckRoute(truck.slug)}`,
    telephone: truck.phone,
    image: truck.images,
    description: truck.description,
    areaServed: truck.serviceAreas.map((area) => ({ '@type': 'City', name: area.name })),
    openingHours: truck.works24Hours ? 'Mo-Su 00:00-24:00' : 'Mo-Su 09:00-21:00',
    priceRange: '֏֏',
    makesOffer: truck.services.map((service) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: SERVICE_LABELS[service] },
    })),
  }
}

export function buildWebsiteSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
  }
}
