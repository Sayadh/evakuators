import { staticCities } from '~/data/cities'
import { staticDistricts } from '~/data/districts'
import { staticRegions } from '~/data/regions'
import { mockTowTrucks } from '~/mocks/towTrucks'

const SITE_URL = 'https://evakuators.am'

interface SitemapEntry {
  path: string
  priority: string
}

function buildEntries(): SitemapEntry[] {
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
    ...mockTowTrucks.map((truck) => ({
      path: `/tow-trucks/${truck.slug}`,
      priority: '0.7',
    })),
  ]
}

export default defineEventHandler((event) => {
  const urls = buildEntries()
    .map(
      (entry) =>
        `  <url><loc>${SITE_URL}${entry.path}</loc><priority>${entry.priority}</priority></url>`,
    )
    .join('\n')

  setHeader(event, 'content-type', 'application/xml')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
})
