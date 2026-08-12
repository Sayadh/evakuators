import { RATING_PRIOR, RATING_PRIOR_WEIGHT } from '~/constants/rating'
import { hasManipulator, matchesCapacityRange } from '~/constants/vehicles'
import { SortOption } from '~/types/enums'
import type { TowTruckCard } from '~/types/towTruck'
import type { TowTruckFilterState } from '~/types/filters'

export function createDefaultFilterState(): TowTruckFilterState {
  return {
    works24Hours: false,
    manipulator: false,
    services: [],
    capacity: null,
    sort: SortOption.Recommended,
  }
}

export function matchesFilters(truck: TowTruckCard, filters: TowTruckFilterState): boolean {
  if (filters.works24Hours && !truck.works24Hours) return false
  // Not `!truck.vehicle.manipulator`: a driver who answered by picking the
  // «Մանիպուլյատորով էվակուատոր» vehicle type and left the redundant checkbox
  // alone was invisible here. See hasManipulator.
  if (filters.manipulator && !hasManipulator(truck.vehicle)) return false
  if (filters.capacity !== null && !matchesCapacityRange(truck.vehicle.capacityTons, filters.capacity))
    return false
  if (filters.services.length > 0) {
    const hasAll = filters.services.every((service) => truck.services.includes(service))
    if (!hasAll) return false
  }
  return true
}

/**
 * "Recommended" score: a smoothed rating, highest first.
 *
 *   score = (n × average + w × prior) / (n + w)
 *
 * It blends the driver's own approved-review average with an assumption about
 * a typical driver (`RATING_PRIOR`), weighted as `RATING_PRIOR_WEIGHT`
 * imaginary reviews. See `constants/rating.ts` for why the prior is 4.3 and
 * not the midpoint of the scale.
 *
 * What that buys, concretely:
 *
 * | reviews        | average | score |
 * | -------------- | ------- | ----- |
 * | none           | —       | 4.30  |
 * | 1 × 5.0        | 5.0     | 4.48  |
 * | 20 × 4.6       | 4.6     | 4.56  |
 * | 8 × 3.2        | 3.2     | 3.50  |
 *
 * A single enthusiastic review cannot leapfrog twenty consistent ones, and an
 * unrated driver lands mid-pack — below proven-good, above proven-bad — rather
 * than at either extreme. Both matter: a new driver buried at the bottom never
 * gets called, so never gets reviewed, and stays buried.
 *
 * `works24Hours` deliberately plays NO part here. It used to be the only
 * factor, which meant availability decided the order regardless of how well
 * anyone actually did the job. It is a filter (see `matchesFilters`) — a
 * customer who needs 24/7 ticks the box; everyone else should see good drivers
 * first, not merely available ones.
 *
 * This score is never shown to anyone. Cards render no rating today, and if
 * they ever do it would be the real average and count, not this number.
 */
function getRecommendedScore(truck: TowTruckCard): number {
  const count = truck.rating?.count ?? 0
  const average = truck.rating?.average ?? 0

  return (
    (count * average + RATING_PRIOR_WEIGHT * RATING_PRIOR) / (count + RATING_PRIOR_WEIGHT)
  )
}

/**
 * The place a listing page is *about*, so the page can ask "is this driver
 * based here?" — see `isBasedAt`.
 *
 * Only a city or a Yerevan district, never a marz and never a road corridor,
 * because those are the only two things `TowTruck.citySlug`/`districtSlug` can
 * hold. A corridor page passes nothing, which is correct rather than a gap: a
 * truck cannot be "based in" «Գառնի–Գեղարդ», so on that page no driver is more
 * local than any other and the ordering falls back to rating alone.
 */
export interface BasePlace {
  citySlug?: string
  districtSlug?: string
}

/**
 * Whether this driver's own base is the place the page is about — i.e. they
 * work here, not merely *also* here.
 *
 * Compared against the structural placement (`location.citySlug` /
 * `districtSlug`), never against `serviceAreas`: every driver on a city page
 * already serves that city, so matching on coverage would make this true for
 * all of them and rank nothing.
 */
export function isBasedAt(truck: TowTruckCard, place: BasePlace | undefined): boolean {
  if (!place) return false
  if (place.citySlug) return truck.location.citySlug === place.citySlug
  if (place.districtSlug) return truck.location.districtSlug === place.districtSlug
  return false
}

/**
 * `basePlace` reorders only the **Recommended** list — deliberately.
 *
 * Recommended is the default and is ours to define, and "the drivers actually
 * based in this town, then everyone else who covers it" is what someone
 * searching a town means. Price is the user overriding that with an explicit
 * instruction: they asked for cheapest first, and a locally-based driver
 * appearing above a cheaper one would read as the sort being broken. So the
 * boost stops at the sort the customer chose.
 *
 * Within each tier the existing rating order is untouched, so being local wins
 * a tie against a stranger but never rescues a badly-rated driver from the
 * bottom of their own tier.
 */
export function sortTowTrucks(
  trucks: TowTruckCard[],
  sort: SortOption,
  basePlace?: BasePlace,
): TowTruckCard[] {
  const sorted = [...trucks]
  switch (sort) {
    case SortOption.Price:
      // Trucks without a price go to the end
      return sorted.sort(
        (a, b) => (a.startingPrice ?? Infinity) - (b.startingPrice ?? Infinity),
      )
    case SortOption.Recommended:
    default:
      return sorted.sort((a, b) => {
        // Two booleans, so this is -1/0/1 and never a partial comparator. With
        // no `basePlace` both sides are false, the difference is 0, and the
        // rating comparison below decides everything exactly as before.
        const byBase = Number(isBasedAt(b, basePlace)) - Number(isBasedAt(a, basePlace))
        if (byBase !== 0) return byBase

        return getRecommendedScore(b) - getRecommendedScore(a)
      })
  }
}

export function applyTowTruckFilters(
  trucks: TowTruckCard[],
  filters: TowTruckFilterState,
  basePlace?: BasePlace,
): TowTruckCard[] {
  return sortTowTrucks(
    trucks.filter((truck) => matchesFilters(truck, filters)),
    filters.sort,
    basePlace,
  )
}

export function countActiveFilters(filters: TowTruckFilterState): number {
  let count = filters.services.length
  if (filters.works24Hours) count += 1
  if (filters.manipulator) count += 1
  if (filters.capacity !== null) count += 1
  return count
}
