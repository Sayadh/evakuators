import { getRegionCitySlugs, getRegionServiceZoneSlugs } from '~/utils/geography'
import {
  needsRegionLabel,
  searchLocations,
  type LocationMatchType,
  type LocationSearchResult,
} from '~/utils/locationSearch'

/**
 * Mirrors the backend's `DispatchLocationType`, which is `LocationType` — the
 * four values that appear in `TowTruck.serviceAreas`.
 */
export type DispatchPlaceType = LocationMatchType

export interface DispatchPlace {
  slug: string
  name: string
  type: DispatchPlaceType
  /** Where it sits, for telling two same-named places apart in the list */
  context?: string

  /**
   * A marz's own towns and road corridors, carried with the place and sent to
   * the backend, which has no geography to expand a marz with.
   *
   * It matters more than it looks: almost nobody stores
   * `{slug: 'kotayk', type: 'region'}` in `serviceAreas` — a driver covering
   * Կոտայք lists Աբովյան, Չարենցավան, Հրազդան. Without the expansion, asking
   * for a marz returns only drivers whose base row names it, and misses
   * everyone who described their coverage the normal way.
   *
   * Empty for everything that is not a marz, and empty for Yerevan: it is a
   * pseudo-region whose "cities" are districts with no shared slug to expand
   * into, so the server answers that one itself.
   */
  regionCitySlugs?: string[]
  regionZoneSlugs?: string[]
}

/** How many suggestions the screen shows — more than this is a list nobody reads while talking */
export const DISPATCH_PLACE_SUGGESTIONS = 6

/**
 * Places matching what the dispatcher typed, best first.
 *
 * ## Why this delegates instead of matching anything itself
 *
 * It used to have its own list and its own matcher: names only, lowercased,
 * prefix-then-contains. That was wrong in three ways at once, and all three
 * showed up the first time somebody used it.
 *
 * - Typing Latin found nothing. `ere` matched no Armenian name, and a
 *   dispatcher typing one-handed while somebody is talking is exactly the
 *   person who will not stop to switch keyboard layout. Russian likewise.
 * - «Երևան» itself found nothing, only its districts — Yerevan is not a city
 *   row, it is a pseudo-region (see CLAUDE.md), so a list built from
 *   regions + cities + districts silently omitted the single most-typed word
 *   on the screen.
 * - Villages, corridors and the hand-written aliases were all missing. A
 *   caller says «Պտղնի» or «Գառնի», not the name of the town whose drivers
 *   cover it.
 *
 * `searchLocations` already solves every one of those, for the public search
 * box, with its own tests: one index over cities, districts, marzes, road
 * corridors and 300 settlements, keyed through `toSearchKey` so «Երևան»,
 * `yerevan` and «Ереван» are the same entry. A second matcher over the same
 * taxonomy was never going to be as good, and — worse — could disagree with
 * the public site about what a word means, which on this screen sends a truck
 * to the wrong town.
 *
 * ## What the mapping adds
 *
 * `result.match` rather than `result.type`: a settlement is a real answer to
 * "where are you" and not a thing any driver declares, so it has to be matched
 * as the city or corridor that serves it. The NAME still shown is the one the
 * dispatcher typed toward — «Պտղնի», not «Աբովյան» — because that is what the
 * caller said and what the referral should record.
 */
export function searchDispatchPlaces(
  query: string,
  limit = DISPATCH_PLACE_SUGGESTIONS,
): DispatchPlace[] {
  const results = searchLocations(query, limit)
  return results.map((result) => toDispatchPlace(result, results))
}

function toDispatchPlace(
  result: LocationSearchResult,
  siblings: LocationSearchResult[],
): DispatchPlace {
  const place: DispatchPlace = {
    slug: result.match.slug,
    name: result.name,
    type: result.match.type,
    context: contextFor(result, siblings),
  }

  if (place.type === 'region') {
    // Yerevan yields nothing here on purpose: `findStaticRegion('yerevan')` is
    // undefined, since it is a pseudo-region rather than one of the 10 marzes
    // (see utils/geography.ts). Its coverage question is answered server-side.
    place.regionCitySlugs = getRegionCitySlugs(place.slug)
    place.regionZoneSlugs = getRegionServiceZoneSlugs(place.slug)
  }

  return place
}

/**
 * The grey line under a suggestion.
 *
 * Says the marz only when it is doing work: when two visible rows read
 * identically (`needsRegionLabel` — there are two Ակունք), or when the row is
 * not a plain city and the reader would otherwise not know what they picked.
 * On a screen read in a hurry, a line under every row is a line nobody reads.
 */
function contextFor(result: LocationSearchResult, siblings: LocationSearchResult[]): string | undefined {
  if (needsRegionLabel(siblings, result)) return result.regionName
  if (result.type === 'region') return 'մարզ'
  if (result.type === 'district') return 'Երևան'
  if (result.type === 'zone') return 'ուղղություն'
  if (result.type === 'settlement') return result.regionName
  return undefined
}

/** localStorage key for the handful of places this operator keeps using */
export const DISPATCH_RECENT_KEY = 'evakuators.dispatch.recent'
/** Enough for a night's worth of repeats; more would wrap onto a second line on a phone */
export const DISPATCH_RECENT_LIMIT = 4

/**
 * The chips above the input: a place moves to the front when used again, and
 * the list never grows past `DISPATCH_RECENT_LIMIT`.
 *
 * Pure so the ordering can be tested without a browser — the storage read and
 * write around it are the caller's problem, and are the part that has to
 * tolerate a private window (see the page).
 */
export function rememberDispatchPlace(
  recent: DispatchPlace[],
  place: DispatchPlace,
): DispatchPlace[] {
  const rest = recent.filter((entry) => !(entry.slug === place.slug && entry.type === place.type))
  return [place, ...rest].slice(0, DISPATCH_RECENT_LIMIT)
}
