import type { SelectOption } from '~/types/common'
import { LocationType } from '~/types/enums'
import {
  cityOrDistrictLabel,
  findCityLocation,
  findServiceZoneLocation,
  findStaticRegion,
  resolveAreaType,
  YEREVAN_REGION_SLUG,
} from '~/utils/geography'

/**
 * Helpers for choosing a tow truck's **base** — the single place it works out
 * of, as opposed to the list of places it will drive to.
 *
 * Kept out of the components because two of them need the same answers (the
 * approval modal and the per-truck editor in `/admin`) and because the label
 * composition below is the kind of string the backend can never rebuild — it
 * has no geography (CLAUDE.md), so whatever is composed here is what is stored
 * and shown forever.
 */

/** A served area, in the shape both admin surfaces already hold */
export interface PrimaryAreaCandidate {
  slug: string
  name: string
  type: string
}

/**
 * The label «Հիմնական գտնվելու վայրը՝ …» renders, built from the two things an
 * admin states: the settlement they picked, and — optionally — the village they
 * are actually parked in.
 *
 * The village half exists because it is the one case the select cannot cover: a
 * driver based in a village that is not, and must not become, a filterable
 * place of its own (adding one would mean a new city in `data/cities.ts`, a new
 * page, a new sitemap entry — for one driver). Writing it into the label keeps
 * the human answer honest while `citySlug` stays the town whose page they rank
 * on.
 *
 * «գյուղ» is spelled out rather than abbreviated because this string is read by
 * customers on a card, not by staff in a table.
 */
export function composeLocationName(placeName: string, settlementName?: string): string {
  const village = settlementName?.trim()
  if (!village) return placeName.trim()
  return `${placeName.trim()}, գյուղ ${village}`
}

/**
 * Which marz each candidate belongs to, as select options — built from the
 * driver's OWN areas rather than from `staticRegions`, so the first select can
 * never offer a marz whose second select would then be empty.
 *
 * Corridors contribute their own marz like anything else — a driver based on
 * «Արագած–Ծաղկահովիտ» is in Aragatsotn, and that is the marz page they belong
 * on.
 */
export function primaryRegionOptions(areas: readonly PrimaryAreaCandidate[]): SelectOption[] {
  const slugs = new Set<string>()

  for (const area of basePlaceCandidates(areas)) {
    const region = regionOfCandidate(area)
    if (region) slugs.add(region)
  }

  return [...slugs].map((slug) => ({
    value: slug,
    label: slug === YEREVAN_REGION_SLUG ? 'Երևան' : (findStaticRegion(slug)?.name ?? slug),
  }))
}

/** The candidate settlements inside one marz, as select options */
export function primaryPlaceOptions(
  areas: readonly PrimaryAreaCandidate[],
  regionSlug: string,
): SelectOption[] {
  return basePlaceCandidates(areas)
    .filter((area) => regionOfCandidate(area) === regionSlug)
    .map((area) => ({
      value: area.slug,
      // The stored name, not a fresh lookup: it is what the driver's own
      // profile already shows, so the picker and the profile cannot disagree.
      label: area.name || cityOrDistrictLabel(area.slug),
    }))
}

/**
 * Areas that could be a base at all — which is now all of them.
 *
 * ## Corridors used to be filtered out here
 *
 * The reasoning was that nobody is "based in" a road. That turned out to be
 * wrong about the actual drivers: some of them do wait on «Արագած–Ծաղկահովիտ»
 * rather than in a town, and a moderator reviewing such a driver was shown two
 * selects with no honest answer in them.
 *
 * What was right in that reasoning is narrower, and still holds: a corridor
 * slug must never reach `citySlug`, because that column is what the city pages
 * filter on and there is no «Արագած–Ծաղկահովիտ» page to be filed under. So a
 * corridor base is stored as an EMPTY placement plus the corridor's name in
 * `locationName` — see `placementFor` below, and `assertPlacementIsServed` on
 * the backend, which still refuses a corridor sent as a city.
 */
export function basePlaceCandidates(
  areas: readonly PrimaryAreaCandidate[],
): PrimaryAreaCandidate[] {
  return [...areas]
}

/** Whether a chosen base is a road corridor rather than a settlement */
export function isRouteBase(slug: string): boolean {
  return resolveAreaType(slug) === LocationType.Route
}

/**
 * The marz a candidate sits in. Districts answer `yerevan` without a lookup —
 * only Yerevan has districts — and cities go through the static data.
 */
export function regionOfCandidate(area: PrimaryAreaCandidate): string | undefined {
  const type = resolveAreaType(area.slug)
  if (type === LocationType.District) return YEREVAN_REGION_SLUG
  // A corridor belongs to a marz too, and it is the marz page the truck should
  // stay on — the city half is the only one a corridor has no answer for.
  if (type === LocationType.Route) return findServiceZoneLocation(area.slug)?.regionSlug
  return findCityLocation(area.slug)?.regionSlug
}

/**
 * The three placement fields for a chosen slug, in the shape both the approval
 * payload and the primary-area payload take.
 *
 * One function so the two paths cannot resolve them differently — which they
 * did before it existed: approval set `regionSlug` from the primary city while
 * the dashboard set it from the driver's first ticked marz, and a driver based
 * in the second marz they picked ended up listed on the first one's page.
 */
export function placementFor(slug: string): {
  citySlug?: string
  districtSlug?: string
  regionSlug?: string
  routeSlug?: string
} {
  const type = resolveAreaType(slug)

  if (type === LocationType.District) {
    // No regionSlug: Yerevan is a pseudo-region and its districts carry no marz.
    return { districtSlug: slug }
  }

  if (type === LocationType.Route) {
    // Deliberately NO citySlug and NO districtSlug. Those two columns are what
    // the city and district pages filter on, and there is no page for a road —
    // so a truck based on one appears on its marz page and nowhere narrower,
    // which is exactly true of where it is.
    //
    // `routeSlug` is validation-only and is never stored: it is how the backend
    // is told that the empty placement is an answer rather than an omission.
    // See `assertPlacementIsServed`.
    return { routeSlug: slug, regionSlug: findServiceZoneLocation(slug)?.regionSlug }
  }

  return { citySlug: slug, regionSlug: findCityLocation(slug)?.regionSlug }
}
