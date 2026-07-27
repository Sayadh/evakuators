import { servesRegion } from './towTrucks.service'
import { staticCities } from '~/data/cities'
import type { Region, RegionWithStats } from '~/types/location'
import type { TowTruck } from '~/types/towTruck'
import { findStaticRegion, getStaticRegions } from '~/utils/geography'

/**
 * Region statistics — **pure and synchronous**: every method takes the already
 * fetched tow truck list and computes counts from it.
 *
 * It used to fetch that list itself (`await towTrucksService.getAll()` at the top
 * of each method), which meant a separate fetch of the identical full fleet per
 * call — three of them on the homepage alone. The fetch now happens once, in
 * `useAllTowTrucks()`, and every location service derives from it.
 *
 * Region *names* need no stats and no truck data at all — use
 * `~/utils/geography.ts` for those.
 */

function withStats(region: Region, trucks: TowTruck[]): RegionWithStats {
  return {
    ...region,
    cityCount: staticCities.filter((city) => city.regionId === region.id).length,
    towTruckCount: trucks.filter((truck) => servesRegion(truck, region.slug)).length,
  }
}

export const regionsService = {
  /** All marzes with their city and tow truck counts */
  allWithStats(trucks: TowTruck[]): RegionWithStats[] {
    return getStaticRegions().map((region) => withStats(region, trucks))
  },

  findWithStats(regionSlug: string, trucks: TowTruck[]): RegionWithStats | null {
    const region = findStaticRegion(regionSlug)
    return region ? withStats(region, trucks) : null
  },

  /** Other marzes — used for "nearby regions" links */
  nearbyWithStats(regionSlug: string, trucks: TowTruck[], limit = 4): RegionWithStats[] {
    return getStaticRegions()
      .filter((region) => region.slug !== regionSlug)
      .slice(0, limit)
      .map((region) => withStats(region, trucks))
  },
}
