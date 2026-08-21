import { hasUncappedCoverage } from '~/constants/serviceAreaLimits'
import type { ServiceArea } from '~/types/towTruck'
import { LocationType } from '~/types/enums'
import {
  cityOrDistrictLabel,
  getRegionCities,
  getStaticDistricts,
  getStaticRegions,
  regionLabel,
  resolveAreaType,
  YEREVAN_REGION_SLUG,
} from './geography'

/**
 * The `serviceAreas` JSON a profile is published with, from whatever the driver
 * was actually asked.
 *
 * ## Why this is one function and not a line in each page
 *
 * Three places write this array — the admin review page, the driver dashboard,
 * and (indirectly) anything that re-publishes a profile — and the shape now
 * depends on which coverage question the driver got. Two implementations would
 * be two answers to "what does «Ամբողջ Հայաստան» look like in the database",
 * and the browsing pages match these entries **literally**: a `type` or a slug
 * that disagrees by one character simply returns nobody, silently.
 *
 * The names are resolved here because the backend has no geography and stores
 * exactly what it is given — sending `name: slug` is what once put raw English
 * slugs on public profiles (see `docs/data-model.md`).
 *
 * ## The base is always in the list
 *
 * `assertPlacementIsServed` requires the truck's base to be one of its served
 * areas, and that rule is worth keeping for specialists too — a truck filed
 * under a place it does not serve ranks first on that town's page while being
 * the one driver who never agreed to go there.
 *
 * So an uncapped driver's base city is appended rather than the rule being
 * relaxed. That is also the honest reading: a crane truck parked in Աշտարակ
 * does serve Աշտարակ, whatever else it covers.
 */
export function buildServiceAreas(input: {
  vehicleType: string
  manipulator?: boolean
  heavyEquipment?: boolean
  servesAllArmenia?: boolean
  regionSlugs: readonly string[]
  citySlugs: readonly string[]
  /** The chosen base — appended so the placement is always a served area */
  baseSlug?: string
}): ServiceArea[] {
  const areas: ServiceArea[] = []

  if (hasUncappedCoverage(input)) {
    // «Ամբողջ Հայաստան» contributes no region rows at all — the flag carries
    // it. Listing all eleven here would make "everywhere" and "ticked all
    // eleven" the same stored value, so the form could never show a driver
    // back the choice they made, and adding a marz would silently shrink the
    // first group's coverage. See `TowTruck.servesAllArmenia`.
    if (!input.servesAllArmenia) {
      for (const slug of input.regionSlugs) {
        areas.push({
          slug,
          // Not `findStaticRegion(slug)?.name ?? slug` — Yerevan isn't one of
          // the 10 marzes `findStaticRegion` searches, so that fallback would
          // print the raw slug "yerevan" on a live profile. See `regionLabel`.
          name: regionLabel(slug),
          type: LocationType.Region,
        })
      }
    }
  } else {
    for (const slug of input.citySlugs) {
      areas.push({ slug, name: cityOrDistrictLabel(slug), type: resolveAreaType(slug) })
    }
  }

  if (input.baseSlug && !areas.some((area) => area.slug === input.baseSlug)) {
    areas.push({
      slug: input.baseSlug,
      name: cityOrDistrictLabel(input.baseSlug),
      type: resolveAreaType(input.baseSlug),
    })
  }

  return areas
}

/**
 * The places a driver may name as their base.
 *
 * For a capped driver that is exactly their coverage list, and nothing else:
 * the base has to be somewhere they said they serve, and offering more would
 * let a moderator file a truck under a town it never claimed.
 *
 * An uncapped driver has no city list to draw on, so the candidates come from
 * the geography their coverage implies — the selected marzes, or the whole
 * country for «Ամբողջ Հայաստան». Corridors are excluded here for the same
 * reason `assertPlacementIsServed` rejects them: a road is not a place a truck
 * is based in, and a corridor base is expressed by an empty placement instead.
 */
export function baseCandidatesFor(input: {
  vehicleType: string
  manipulator?: boolean
  heavyEquipment?: boolean
  servesAllArmenia?: boolean
  regionSlugs: readonly string[]
  citySlugs: readonly string[]
}): ServiceArea[] {
  if (!hasUncappedCoverage(input)) {
    return input.citySlugs.map((slug) => ({
      slug,
      name: cityOrDistrictLabel(slug),
      type: resolveAreaType(slug),
    }))
  }

  const regionSlugs = input.servesAllArmenia
    ? getStaticRegions().map((region) => region.slug)
    : input.regionSlugs

  return regionSlugs.flatMap<ServiceArea>((regionSlug) =>
    regionSlug === YEREVAN_REGION_SLUG
      ? getStaticDistricts().map((district) => ({
          slug: district.slug,
          name: district.name,
          type: LocationType.District,
        }))
      : getRegionCities(regionSlug).map((city) => ({
          slug: city.slug,
          name: city.name,
          type: LocationType.City,
        })),
  )
}
