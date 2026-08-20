import { RATING_PRIOR, RATING_PRIOR_WEIGHT } from '~/constants/rating'
import { matchesCapacityRange } from '~/constants/vehicles'
import { SortOption } from '~/types/enums'
import type { TowTruckCard } from '~/types/towTruck'
import { seededShuffle } from '~/utils/seededShuffle'
import type { TowTruckFilterState } from '~/types/filters'

export function createDefaultFilterState(): TowTruckFilterState {
  return {
    works24Hours: false,
    services: [],
    vehicleType: null,
    capacity: null,
    sort: SortOption.Recommended,
  }
}

export function matchesFilters(truck: TowTruckCard, filters: TowTruckFilterState): boolean {
  if (filters.works24Hours && !truck.works24Hours) return false
  // Plain equality, unlike the old manipulator filter: `flatbed` and
  // `sliding-platform` are not asked twice at registration, so there is no
  // union to apply. The specialist types never reach here as a value — see
  // GENERAL_LISTING_VEHICLE_TYPE_OPTIONS.
  if (filters.vehicleType !== null && truck.vehicle.type !== filters.vehicleType) return false
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
 * The rating, as a **coarse band** rather than a number.
 *
 * The smoothed score is a near-total order: with a prior of 4.3 it separates
 * drivers by hundredths, so ordering by it directly produced one fixed queue —
 * the same two or three profiles at the top of a town's page every time, and
 * everyone below them effectively unreachable. On a marketplace whose supply is
 * a few drivers per town, that is not a ranking, it is a monopoly.
 *
 * Rounding to a half point collapses that. Almost every driver lands in the same
 * band as everyone else, so the band decides nothing most of the time; a
 * genuinely bad record (the 8 × 3.2 row in the table above scores 3.50) still
 * drops one, and stays below. It is the weakest separation that still means
 * something.
 *
 * Half a point, not a whole one: whole points would put 4.0 and 4.9 together,
 * which is the difference between "fine" and "excellent" and is exactly what a
 * customer would want honoured.
 */
function ratingBand(truck: TowTruckCard): number {
  return Math.round(getRecommendedScore(truck) * 2) / 2
}

/**
 * Orders a list for the **Recommended** sort — the only sort this touches;
 * `SortOption.Price` is the customer's own explicit instruction and is never
 * reordered by anything below.
 *
 * ## Two modes
 *
 * `tiered` (the default, used by every listing page — marz, Yerevan overview,
 * vehicle-type pages, the homepage's featured section, "similar trucks") still
 * groups by a coarse **rating band** and shuffles within it: see `ratingBand`
 * for why it is a half-point band and not the raw smoothed score. A fixed
 * queue by hundredths meant the same two or three profiles sat on top of every
 * list forever, and everyone below them never got called, so never got
 * reviewed, so never moved — the ordering was quietly deciding who got work.
 *
 * `tiered: false` — used only by the city/district search pages
 * (`useTowTruckFilters` → `applyTowTruckFilters`) — skips the rating band
 * entirely and returns the shuffle itself: every driver, regardless of rating
 * or of being locally based, has an equal chance at the top of the list on
 * every page load. This was a direct, later request on top of the banded
 * behaviour above — those two pages used to also boost a driver based in the
 * town being searched, and now do not.
 *
 * ## `seed`, and why the shuffle is not in the comparator
 *
 * A comparator that returns random values is not a comparator: the sort
 * contract requires consistency, and violating it lets an engine produce
 * anything at all. So the list is shuffled FIRST and, in tiered mode, sorted by
 * the band second — `Array.prototype.sort` is stable (ES2019), so entries with
 * equal bands keep the shuffled order they arrived in.
 *
 * `seed` is decided once per page load and travels in the Nuxt payload
 * (`useListingShuffleSeed`), because the same permutation has to happen on the
 * server and in the browser or hydration breaks. Omitting it is legitimate and
 * means "do not shuffle" — the mock-mode and test paths take it, and so does
 * any caller that wants a reproducible list.
 */
export function sortTowTrucks(
  trucks: TowTruckCard[],
  sort: SortOption,
  seed?: number,
  tiered = true,
): TowTruckCard[] {
  switch (sort) {
    case SortOption.Price:
      // Trucks without a price go to the end. Not shuffled at all: the customer
      // asked for cheapest first, and two drivers on the same price swapping
      // places between refreshes would read as the sort being broken.
      return [...trucks].sort(
        (a, b) => (a.startingPrice ?? Infinity) - (b.startingPrice ?? Infinity),
      )
    case SortOption.Recommended:
    default: {
      const base = seed === undefined ? [...trucks] : seededShuffle(trucks, seed)

      if (!tiered) return base

      // Bands, not scores. Equal bands compare 0, and a stable sort then
      // leaves the shuffled order in place — which is the whole mechanism.
      return base.sort((a, b) => ratingBand(b) - ratingBand(a))
    }
  }
}

/**
 * The city/district search pages' own entry point — always flat-random (see
 * `sortTowTrucks`'s `tiered: false` mode), because this is their only caller
 * and that is the order they show. Every other listing goes through
 * `useTowTrucks.ts`'s `recommendedWith` instead, which keeps the rating band.
 */
export function applyTowTruckFilters(
  trucks: TowTruckCard[],
  filters: TowTruckFilterState,
  seed?: number,
): TowTruckCard[] {
  return sortTowTrucks(
    trucks.filter((truck) => matchesFilters(truck, filters)),
    filters.sort,
    seed,
    false,
  )
}

export function countActiveFilters(filters: TowTruckFilterState): number {
  let count = filters.services.length
  if (filters.works24Hours) count += 1
  if (filters.vehicleType !== null) count += 1
  if (filters.capacity !== null) count += 1
  return count
}
