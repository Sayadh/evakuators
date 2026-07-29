import type { H3Event } from 'h3'
import { staticCities } from '~/data/cities'
import { staticDistricts } from '~/data/districts'
import { staticRegions } from '~/data/regions'
import { mockTowTrucks } from '~/mocks/towTrucks'

const SITE_URL = 'https://evakuators.am'

/** Matches the backend's TOW_TRUCK_LIST_MAX_LIMIT — one request per 200 trucks */
const SITEMAP_PAGE_SIZE = 200

/**
 * Hard stop on the page walk. A sitemap is generated per crawler request, so an
 * unbounded loop against a misbehaving backend (one that keeps returning full
 * pages) would be a self-inflicted denial of service. 10k tow truck pages is far
 * beyond anything realistic for Armenia and still only 50 requests.
 */
const SITEMAP_MAX_TRUCKS = 10_000

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
  const config = useRuntimeConfig(event)
  if (!config.public.apiBaseUrl) {
    return mockTowTrucks.map((truck) => ({ slug: truck.slug, updatedAt: truck.updatedAt }))
  }
  // Server-side call — prefer the loopback URL for the same reason SSR page
  // fetches do (see getApiBase() in repositories/apiClient.ts). This one walks
  // up to 50 pages per crawler hit, so it is the single heaviest consumer of
  // the shared public rate-limit bucket if it goes out through nginx.
  const apiBase = config.internalApiBaseUrl || config.public.apiBaseUrl

  // The listing endpoint is capped (see backend tow-trucks.constants.ts), and a
  // sitemap that silently stops at the cap is worse than no sitemap: Google
  // would simply never learn about the trucks past it. So this is the one
  // consumer that walks the pages.
  const entries: TowTruckSitemapEntry[] = []
  try {
    for (let offset = 0; offset < SITEMAP_MAX_TRUCKS; offset += SITEMAP_PAGE_SIZE) {
      const page = await $fetch<TowTruckSitemapEntry[]>('/tow-trucks', {
        baseURL: apiBase,
        query: { limit: SITEMAP_PAGE_SIZE, offset },
      })
      entries.push(...page.map((truck) => ({ slug: truck.slug, updatedAt: truck.updatedAt })))
      if (page.length < SITEMAP_PAGE_SIZE) break
    }
    return entries
  } catch {
    // Backend unreachable — better to serve a sitemap with whatever pages we
    // already collected than to fail the whole route or leak stale mock URLs.
    return entries
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
