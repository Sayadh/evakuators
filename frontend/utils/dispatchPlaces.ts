import { getRegionCities, getStaticDistricts, getStaticRegions } from '~/utils/geography'

/** Mirrors the backend's `DispatchLocationType` */
export type DispatchPlaceType = 'city' | 'district' | 'region'

export interface DispatchPlace {
  slug: string
  name: string
  type: DispatchPlaceType
  /** Where it sits, for telling two same-named places apart in the list */
  context?: string
}

/**
 * Every place a caller might name, flattened into one searchable list.
 *
 * Built from the static geography rather than fetched, for the reason
 * `useLocationSearch` gives: this taxonomy is TypeScript constants, so the
 * whole thing is synchronous and there is no request to race. On the dispatch
 * screen that matters more than anywhere else — the operator is typing while
 * somebody is on the phone, and a suggestion list that arrives late is a
 * suggestion list that gets typed past.
 *
 * Districts are Yerevan's; cities are every region's; regions are the marzes
 * themselves, for the caller who can only say "somewhere in Lori".
 */
export function buildDispatchPlaces(): DispatchPlace[] {
  const places: DispatchPlace[] = []

  for (const district of getStaticDistricts()) {
    places.push({ slug: district.slug, name: district.name, type: 'district', context: 'Երևան' })
  }

  for (const region of getStaticRegions()) {
    for (const city of getRegionCities(region.slug)) {
      places.push({ slug: city.slug, name: city.name, type: 'city', context: region.name })
    }
    places.push({ slug: region.slug, name: region.name, type: 'region', context: 'մարզ' })
  }

  return places
}

/** How many suggestions the screen shows — more than this is a list nobody reads while talking */
export const DISPATCH_PLACE_SUGGESTIONS = 6

/**
 * Places matching what has been typed, best first.
 *
 * Prefix matches rank above contained ones, because someone typing «աբով»
 * means Աբովյան and should not have to look past a city that merely contains
 * those letters. Case-folded, and Armenian has no locale surprises here — the
 * names and the input are both Armenian script.
 *
 * Deliberately not fuzzy. A wrong suggestion accepted in a hurry sends a truck
 * to the wrong town, and a dispatcher who has to check every row is slower
 * than one who types two more letters.
 */
export function searchDispatchPlaces(
  places: DispatchPlace[],
  query: string,
  limit = DISPATCH_PLACE_SUGGESTIONS,
): DispatchPlace[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return []

  const prefix: DispatchPlace[] = []
  const contains: DispatchPlace[] = []

  for (const place of places) {
    const name = place.name.toLowerCase()
    if (name.startsWith(needle)) prefix.push(place)
    else if (name.includes(needle)) contains.push(place)
  }

  return [...prefix, ...contains].slice(0, limit)
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
