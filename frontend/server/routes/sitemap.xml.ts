import type { H3Event } from 'h3'
import { staticCities } from '~/data/cities'
import { staticDistricts } from '~/data/districts'
import { staticRegions } from '~/data/regions'
import { mockTowTrucks } from '~/mocks/towTrucks'
import type { TowTruck } from '~/types/towTruck'

const SITE_URL = 'https://evakuators.am'

interface SitemapEntry {
  path: string
  priority: string
}

/**
 * Same data-source switch as `towTrucksService`: with a configured API base,
 * read real slugs from the backend; otherwise fall back to mock data.
 * Never hardcode mocks here — this route runs in production too.
 */
async function getTowTruckSlugs(event: H3Event): Promise<string[]> {
  const apiBase = useRuntimeConfig(event).public.apiBaseUrl
  if (!apiBase) {
    return mockTowTrucks.map((truck) => truck.slug)
  }

  try {
    const trucks = await $fetch<TowTruck[]>('/tow-trucks', { baseURL: apiBase })
    return trucks.map((truck) => truck.slug)
  } catch {
    // Backend unreachable — better to serve a sitemap without truck pages
    // than to fail the whole route or leak stale mock URLs.
    return []
  }
}

function buildEntries(towTruckSlugs: string[]): SitemapEntry[] {
  const regionSlugById = new Map(staticRegions.map((region) => [region.id, region.slug]))

  return [
    { path: '/', priority: '1.0' },
    { path: '/yerevan', priority: '0.9' },
    { path: '/regions', priority: '0.8' },
    { path: '/register', priority: '0.6' },
    { path: '/about', priority: '0.4' },
    { path: '/contact', priority: '0.4' },
    ...staticRegions.map((region) => ({
      path: `/regions/${region.slug}`,
      priority: '0.8',
    })),
    ...staticCities.flatMap((city) => {
      const regionSlug = regionSlugById.get(city.regionId)
      return regionSlug
        ? [{ path: `/regions/${regionSlug}/${city.slug}`, priority: '0.9' }]
        : []
    }),
    ...staticDistricts.map((district) => ({
      path: `/yerevan/${district.slug}`,
      priority: '0.9',
    })),
    ...towTruckSlugs.map((slug) => ({
      path: `/tow-trucks/${slug}`,
      priority: '0.7',
    })),
  ]
}

export default defineEventHandler(async (event) => {
  const towTruckSlugs = await getTowTruckSlugs(event)
  const urls = buildEntries(towTruckSlugs)
    .map(
      (entry) =>
        `  <url><loc>${SITE_URL}${entry.path}</loc><priority>${entry.priority}</priority></url>`,
    )
    .join('\n')

  setHeader(event, 'content-type', 'application/xml')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
})
