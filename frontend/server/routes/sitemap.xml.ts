import type { H3Event } from 'h3'
import { staticCities } from '~/data/cities'
import { staticDistricts } from '~/data/districts'
import { staticRegions } from '~/data/regions'
import { staticServiceZones } from '~/data/serviceZones'
import { VEHICLE_TYPE_GEOS, VEHICLE_TYPE_PAGE_LIST } from '~/constants/vehicleTypePages'
import { servesCity, servesRegion, servesYerevan } from '~/services/towTrucks.service'
import type { TowTruckCard, TowTruckCoverage } from '~/types/towTruck'
import { findSettlementTargetCity, getLandingSettlements } from '~/utils/settlements'
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
/**
 * Landing settlements that are safe to announce.
 *
 * A landing page is only worth indexing when it can show something: the rule is
 * complete SEO copy AND at least one driver covering its target city. An
 * indexable URL that renders an empty list is a thin page, and 300 of them
 * would be a doorway farm — which is exactly why only four settlements have
 * landing pages at all.
 *
 * Driver presence is read from `/tow-trucks/coverage`, the same tiny endpoint
 * the browse counters use (~230 B per truck, no contact data). If that call
 * fails the answer is "none": a sitemap that omits a good page costs a little
 * discovery time, one that lists an empty page costs trust.
 */
async function getIndexableLandingPaths(event: H3Event): Promise<string[]> {
  const landings = getLandingSettlements()
  if (landings.length === 0) return []

  const config = useRuntimeConfig(event)
  let coverage: TowTruckCoverage[]

  if (!config.public.apiBaseUrl) {
    coverage = mockTowTrucks.map((truck) => ({
      location: truck.location,
      serviceAreas: truck.serviceAreas.map((area) => ({ slug: area.slug, type: area.type })),
      works24Hours: truck.works24Hours,
    }))
  } else {
    try {
      coverage = await $fetch<TowTruckCoverage[]>('/tow-trucks/coverage', {
        baseURL: config.internalApiBaseUrl || config.public.apiBaseUrl,
      })
    } catch {
      return []
    }
  }

  const paths: string[] = []
  for (const settlement of landings) {
    const city = findSettlementTargetCity(settlement)
    const region = staticRegions.find((item) => item.id === settlement.regionId)
    if (!city || !region) continue
    if (!coverage.some((truck) => servesCity(truck, city.slug))) continue
    paths.push(`/regions/${region.slug}/${settlement.slug}`)
  }
  return paths
}

/**
 * Walks the capped listing endpoint for ONE query, page by page.
 *
 * The listing endpoint is capped (see backend tow-trucks.constants.ts), and a
 * sitemap that silently stops at the cap is worse than no sitemap: Google would
 * simply never learn about the trucks past it. So this is the one consumer that
 * pages through it.
 *
 * Swallows its own failure and returns what it collected — a partial sitemap
 * beats a failed route, and a caller that aborted the whole walk on one bad
 * query would let an unreachable landing-page listing take the city pages down
 * with it.
 */
async function walkListing(apiBase: string, query: Record<string, string>): Promise<TowTruckCard[]> {
  const entries: TowTruckCard[] = []
  try {
    for (let offset = 0; offset < SITEMAP_MAX_TRUCKS; offset += SITEMAP_PAGE_SIZE) {
      const page = await $fetch<TowTruckCard[]>('/tow-trucks', {
        baseURL: apiBase,
        query: { ...query, limit: SITEMAP_PAGE_SIZE, offset },
      })
      entries.push(...page)
      if (page.length < SITEMAP_PAGE_SIZE) break
    }
  } catch {
    // Backend unreachable — better to serve a sitemap with whatever pages we
    // already collected than to fail the whole route or leak stale mock URLs.
  }
  return entries
}

/**
 * Which vehicle-type AREA pages have at least one driver.
 *
 * ## Why the answer is computed here and not fetched
 *
 * The obvious source would be `/tow-trucks/coverage`, which is what the landing
 * settlements use — but that endpoint is general discovery and no longer
 * returns these trucks at all (docs/taxonomies.md), so it cannot answer this
 * question by construction. The alternative, one request per area per type,
 * is 22 extra round trips on a route that already walks the listing.
 *
 * So it reuses what the vehicle-type walk already fetched. A listing card
 * carries `location` and `serviceAreas`, which is exactly what `servesRegion`
 * and `servesYerevan` read — the same predicates the pages themselves filter
 * with, so a page cannot be announced here and render empty there.
 *
 * ## Why an empty area is left out rather than listed
 *
 * A URL that ranks for «մանիպուլյատոր Տավուշ» and then shows nothing is a thin
 * page, and eleven of them per type would be a doorway farm — the exact trap
 * the 300 settlements are kept out of the sitemap for. The page still exists
 * and still answers 200; it sends `noindex, follow` until it has something to
 * list (`VehicleTypeListing.vue`), and the day a driver registers there it
 * becomes indexable and appears here with no code change.
 */
function getIndexableVehicleTypeGeoPaths(pageSlug: string, trucks: TowTruckCard[]): string[] {
  return VEHICLE_TYPE_GEOS.filter((geo) =>
    geo.isYerevan
      ? trucks.some((truck) => servesYerevan(truck))
      : trucks.some((truck) => servesRegion(truck, geo.slug)),
  ).map((geo) => `/${pageSlug}/${geo.slug}`)
}

interface TowTruckSitemapData {
  trucks: TowTruckSitemapEntry[]
  /** `/manipulator/kotayk`-shaped paths, only for areas that have a driver */
  vehicleTypeGeoPaths: string[]
}

async function getTowTrucksForSitemap(event: H3Event): Promise<TowTruckSitemapData> {
  const config = useRuntimeConfig(event)
  if (!config.public.apiBaseUrl) {
    return {
      trucks: mockTowTrucks.map((truck) => ({ slug: truck.slug, updatedAt: truck.updatedAt })),
      // Mock mode is for local and design work; announcing area pages built
      // from fixture data would be announcing URLs that do not exist in
      // production. The two vehicle-type pages themselves are still listed.
      vehicleTypeGeoPaths: [],
    }
  }
  // Server-side call — prefer the loopback URL for the same reason SSR page
  // fetches do (see getApiBase() in repositories/apiClient.ts). This walks the
  // listing several times per crawler hit, so it is the single heaviest
  // consumer of the shared public rate-limit bucket if it goes out through
  // nginx.
  const apiBase = config.internalApiBaseUrl || config.public.apiBaseUrl

  // One walk per listing this site actually publishes, not one walk full stop.
  //
  // `GET /tow-trucks` is GENERAL discovery and no longer answers with the
  // specialist vehicle types (docs/taxonomies.md § "Landing-page-only vehicle
  // types"). Their profile pages are still real pages, linked from
  // `/manipulator` and `/tsanr-tehnika` — walking only the general listing
  // would quietly deindex every one of them, which is the exact class of
  // silent omission the /free-routes note above records.
  //
  // Driven by VEHICLE_TYPE_PAGE_LIST, the same constant the nav and the page
  // entries in buildEntries() come from, so a third landing page is walked
  // automatically instead of being remembered.
  const [general, ...byVehicleType] = await Promise.all([
    walkListing(apiBase, {}),
    ...VEHICLE_TYPE_PAGE_LIST.map((page) =>
      walkListing(apiBase, { vehicleType: page.vehicleType }),
    ),
  ])

  // The same walks answer twice: which profile URLs exist, and which area
  // pages have anything on them. No extra requests for the second question —
  // see getIndexableVehicleTypeGeoPaths.
  const vehicleTypeGeoPaths = VEHICLE_TYPE_PAGE_LIST.flatMap((page, index) =>
    getIndexableVehicleTypeGeoPaths(page.slug, byVehicleType[index] ?? []),
  )

  // Deduped by slug, because the walks legitimately overlap: a landing page
  // answers with a UNION (the vehicle type OR the equipment flag), so a flatbed
  // carrying a crane is in both `/manipulator`'s listing and the general one. A
  // repeated <url> is a malformed sitemap, not a stronger signal.
  const bySlug = new Map<string, TowTruckSitemapEntry>()
  for (const truck of [general ?? [], ...byVehicleType].flat()) {
    bySlug.set(truck.slug, { slug: truck.slug, updatedAt: truck.updatedAt })
  }

  return { trucks: [...bySlug.values()], vehicleTypeGeoPaths }
}

function buildEntries(
  towTrucks: TowTruckSitemapEntry[],
  landingPaths: string[],
  vehicleTypeGeoPaths: string[],
): SitemapEntry[] {
  const regionSlugById = new Map(staticRegions.map((region) => [region.id, region.slug]))

  return [
    { path: '/', priority: '1.0', changefreq: 'daily' },
    // High priority, `monthly` changefreq: the page ranks for "էվակուատոր
    // մոտակայքում"-style intent, but its own markup is static — the results are
    // client-side and per-visitor, so there is nothing here for a crawler to
    // come back for. Claiming `daily` on a page whose HTML never changes is the
    // signal-poisoning this file already avoids for <lastmod>.
    //
    // Listed even while NEAREST_SEARCH_ENABLED is false. The page is a real
    // page either way — it explains the feature and offers the region/city
    // search underneath — so there is something here worth indexing, and the
    // URL keeps its history instead of appearing for the first time on launch
    // day. See constants/features.ts.
    { path: '/evakuator', priority: '0.9', changefreq: 'monthly' },
    { path: '/yerevan', priority: '0.9', changefreq: 'daily' },
    // `daily` is not a guess here: free routes are posted and auto-expire
    // continuously (see docs/free-routes.md), so this page's content genuinely
    // turns over faster than any other non-listing page on the site.
    { path: '/free-routes', priority: '0.8', changefreq: 'daily' },
    { path: '/regions', priority: '0.8', changefreq: 'weekly' },
    // The vehicle-type landing pages. Derived from the same list the header
    // reads, so a page can never be in the nav and missing from here — which is
    // exactly what happened to /free-routes once (see the note above it).
    // `weekly`: the listing changes whenever a driver of that type joins or
    // edits their profile, which is real but not daily.
    ...VEHICLE_TYPE_PAGE_LIST.map((page) => ({
      path: `/${page.slug}`,
      priority: '0.8',
      changefreq: 'weekly' as const,
    })),
    // Their area pages — `/manipulator/yerevan` and friends — but only the ones
    // that actually have a driver. Priority just under the parent for the same
    // reason a city sits under a marz: it is the more specific query and the
    // shorter path to a phone number, but the parent is the entry point.
    ...vehicleTypeGeoPaths.map((path) => ({
      path,
      priority: '0.7',
      changefreq: 'weekly' as const,
    })),
    { path: '/register', priority: '0.6', changefreq: 'monthly' },
    { path: '/about', priority: '0.4', changefreq: 'monthly' },
    { path: '/contact', priority: '0.4', changefreq: 'monthly' },
    // Low priority but genuinely indexable: a privacy policy is a page people
    // search for by name when deciding whether to trust a site, and one that
    // exists only behind a signup modal reads as a policy with something to
    // hide. `monthly` like the other two static pages — `SitemapEntry` offers
    // no slower option, and it is the honest end of the range anyway: this page
    // changes only when the policy version is bumped.
    { path: '/privacy', priority: '0.3', changefreq: 'monthly' },
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
    // Road corridors share the city URL shape and are real, indexable pages —
    // a page that exists and is linked from the pickers has to be announced
    // here too, which is exactly what /free-routes was missing once (see
    // docs/pages-and-routes.md). Lower priority than a city: fewer drivers,
    // narrower intent.
    ...staticServiceZones.flatMap((zone) => {
      const regionSlug = regionSlugById.get(zone.regionId)
      return regionSlug
        ? [{ path: `/regions/${regionSlug}/${zone.slug}`, priority: '0.6', changefreq: 'weekly' as const }]
        : []
    }),
    ...staticDistricts.map((district) => ({
      path: `/yerevan/${district.slug}`,
      priority: '0.9',
      changefreq: 'daily' as const,
    })),
    // Only the landing settlements that passed the checks above. The other 296
    // have no URL of their own: 20 redirect to their corridor (and a redirect
    // must never appear in a sitemap), and 276 are simply part of a city's
    // coverage. Aliases never become URLs at all.
    ...landingPaths.map((path) => ({
      path,
      priority: '0.5',
      changefreq: 'weekly' as const,
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
  const [towTruckData, landingPaths] = await Promise.all([
    getTowTrucksForSitemap(event),
    getIndexableLandingPaths(event),
  ])
  const urls = buildEntries(
    towTruckData.trucks,
    landingPaths,
    towTruckData.vehicleTypeGeoPaths,
  )
    .map((entry) => {
      const lastmod = entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''
      return `  <url><loc>${SITE_URL}${entry.path}</loc>${lastmod}<changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority></url>`
    })
    .join('\n')

  setHeader(event, 'content-type', 'application/xml')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
})
