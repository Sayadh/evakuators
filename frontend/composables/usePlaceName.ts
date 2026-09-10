import { localizedPlaceName, type PlaceKind } from '~/i18n/placeNames'

/**
 * The name to show for a place, in the language being rendered.
 *
 * A composable rather than a bare import so callers do not each reach for
 * `useI18n().locale` and then forget to make it reactive — the returned
 * function reads the locale at call time, so a component that renders a city
 * name re-renders it when the language changes without doing anything.
 *
 * `data/*.ts` stays the Armenian source of truth; the translations live in
 * `i18n/placeNames.ts`. See that file for why they are a separate map and why
 * the 300 settlements are deliberately not in it.
 */
export function usePlaceName(): (kind: PlaceKind, slug: string, armenianName: string) => string {
  const { locale } = useI18n()
  return (kind, slug, armenianName) =>
    localizedPlaceName(kind, slug, armenianName, locale.value)
}

/**
 * The name of a driver's service area, in the language being rendered.
 *
 * `ServiceArea.type` is a `LocationType`, which is the same taxonomy as
 * `PlaceKind` under a different name plus `route` — a road corridor, which the
 * place map calls a `zone`. Mapping it here rather than at each call site is
 * what stops a component quietly passing `'route'` and getting the Armenian
 * name back for every corridor.
 */
export function useAreaName(): (area: { name: string; slug: string; type: string }) => string {
  const placeName = usePlaceName()
  return (area) => placeName(area.type === 'route' ? 'zone' : (area.type as PlaceKind), area.slug, area.name)
}

/**
 * The name of a driver's base.
 *
 * `TowTruckLocation` carries the display name plus whichever of the three
 * slugs applies, so the kind is read off the slug that is set — district
 * first, because a Yerevan district also has no region slug to fall back on.
 * A record with no slug at all (legacy rows) keeps its stored name.
 */
export function useLocationName(): (location: {
  name: string
  regionSlug?: string
  citySlug?: string
  districtSlug?: string
}) => string {
  const placeName = usePlaceName()
  return (location) => {
    if (location.districtSlug) return placeName('district', location.districtSlug, location.name)
    if (location.citySlug) return placeName('city', location.citySlug, location.name)
    if (location.regionSlug) return placeName('region', location.regionSlug, location.name)
    return location.name
  }
}
