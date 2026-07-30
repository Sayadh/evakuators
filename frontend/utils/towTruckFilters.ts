import { RATING_PRIOR, RATING_PRIOR_WEIGHT } from '~/constants/rating'
import { matchesCapacityRange } from '~/constants/vehicles'
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
  if (filters.manipulator && !truck.vehicle.manipulator) return false
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

export function sortTowTrucks(trucks: TowTruckCard[], sort: SortOption): TowTruckCard[] {
  const sorted = [...trucks]
  switch (sort) {
    case SortOption.Price:
      // Trucks without a price go to the end
      return sorted.sort(
        (a, b) => (a.startingPrice ?? Infinity) - (b.startingPrice ?? Infinity),
      )
    case SortOption.Recommended:
    default:
      return sorted.sort((a, b) => getRecommendedScore(b) - getRecommendedScore(a))
  }
}

export function applyTowTruckFilters(
  trucks: TowTruckCard[],
  filters: TowTruckFilterState,
): TowTruckCard[] {
  return sortTowTrucks(
    trucks.filter((truck) => matchesFilters(truck, filters)),
    filters.sort,
  )
}

export function countActiveFilters(filters: TowTruckFilterState): number {
  let count = filters.services.length
  if (filters.works24Hours) count += 1
  if (filters.manipulator) count += 1
  if (filters.capacity !== null) count += 1
  return count
}
