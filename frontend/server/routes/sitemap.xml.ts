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
  /** How often the page's content realistically changes — helps crawl budget */
  changefreq: 'daily' | 'weekly' | 'monthly'
  /**
   * ISO date, only when we actually know it changed (a real timestamp).
   * Omitted otherwise — <lastmod> is optional in the sitemap spec, and a
   * fake "today" on every single URL (including static pages that never
   * change) teaches crawlers to distrust the signal entirely.
   */
  lastmod?: string
}

interface TowTruckSitemapEntry {
  slug: string
  /** ISO datetime */
  updatedAt: string
}

/**
 * Same data-source switch as `towTrucksService`: with a configured API base,
 * read real slugs (+ real updatedAt) from the backend; otherwise fall back
 * to mock data. Never hardcode mocks here — this route runs in production too.
 */
async function getTowTrucksForSitemap(event: H3Event): Promise<TowTruckSitemapEntry[]> {
  const apiBase = useRuntimeConfig(event).public.apiBaseUrl
  if (!apiBase) {
    return mockTowTrucks.map((truck) => ({ slug: truck.slug, updatedAt: truck.updatedAt }))
  }

  try {
    const trucks = await $fetch<TowTruck[]>('/tow-trucks', { baseURL: apiBase })
    return trucks.map((truck) => ({ slug: truck.slug, updatedAt: truck.updatedAt }))
  } catch {
    // Backend unreachable — better to serve a sitemap without truck pages
    // than to fail the whole route or leak stale mock URLs.
    return []
  }
}

function buildEntries(towTrucks: TowTruckSitemapEntry[]): SitemapEntry[] {
  const regionSlugById = new Map(staticRegions.map((region) => [region.id, region.slug]))

  return [
    { path: '/', priority: '1.0', changefreq: 'daily' },
    { path: '/yerevan', priority: '0.9', changefreq: 'daily' },
    { path: '/regions', priority: '0.8', changefreq: 'weekly' },
    { path: '/register', priority: '0.6', changefreq: 'monthly' },
    { path: '/about', priority: '0.4', changefreq: 'monthly' },
    { path: '/contact', priority: '0.4', changefreq: 'monthly' },
    ...staticRegions.map((region) => ({
      path: `/regions/${region.slug}`,
      priority: '0.8',
      changefreq: 'weekly' as const,
    })),
    ...staticCities.flatMap((city) => {
      const regionSlug = regionSlugById.get(city.regionId)
      return regionSlug
        ? [{ path: `/regions/${regionSlug}/${city.slug}`, priority: '0.9', changefreq: 'daily' as const }]
        : []
    }),
    ...staticDistricts.map((district) => ({
      path: `/yerevan/${district.slug}`,
      priority: '0.9',
      changefreq: 'daily' as const,
    })),
    // The only entries with a real, honest lastmod — TowTruck.updatedAt
    // changes whenever the driver or admin actually edits that profile.
    ...towTrucks.map((truck) => ({
      path: `/tow-trucks/${truck.slug}`,
      priority: '0.7',
      changefreq: 'weekly' as const,
      lastmod: truck.updatedAt.slice(0, 10),
    })),
  ]
}

export default defineEventHandler(async (event) => {
  const towTrucks = await getTowTrucksForSitemap(event)
  const urls = buildEntries(towTrucks)
    .map((entry) => {
      const lastmod = entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''
      return `  <url><loc>${SITE_URL}${entry.path}</loc>${lastmod}<changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority></url>`
    })
    .join('\n')

  setHeader(event, 'content-type', 'application/xml')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
})
