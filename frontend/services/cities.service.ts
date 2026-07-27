import { servesCity } from './towTrucks.service'
import { staticRegions } from '~/data/regions'
import type { City, CityWithStats } from '~/types/location'
import type { TowTruck } from '~/types/towTruck'
import { findStaticCity, getRegionCities } from '~/utils/geography'

/**
 * City statistics — pure and synchronous, same contract as `regionsService`.
 *
 * Cities themselves are STATIC frontend data; only the counts are dynamic, and
 * they are computed from the tow truck list the caller passes in (fetched once
 * by `useAllTowTrucks()`). For city *names* and *routes*, use
 * `~/utils/geography.ts` — no truck data required.
 */

function withStats(city: City, trucks: TowTruck[]): CityWithStats | null {
  const region = staticRegions.find((item) => item.id === city.regionId)
  if (!region) return null

  const serving = trucks.filter((truck) => servesCity(truck, city.slug))
  return {
    ...city,
    regionSlug: region.slug,
    regionName: region.name,
    towTruckCount: serving.length,
    towTruck24hCount: serving.filter((truck) => truck.works24Hours).length,
  }
}

/** Drops cities whose region is missing — a data error, not a renderable row */
function mapWithStats(cities: City[], trucks: TowTruck[]): CityWithStats[] {
  return cities
    .map((city) => withStats(city, trucks))
    .filter((city): city is CityWithStats => city !== null)
}

export const citiesService = {
  byRegionWithStats(regionSlug: string, trucks: TowTruck[]): CityWithStats[] {
    return mapWithStats(getRegionCities(regionSlug), trucks)
  },

  findWithStats(regionSlug: string, citySlug: string, trucks: TowTruck[]): CityWithStats | null {
    const city = findStaticCity(regionSlug, citySlug)
    return city ? withStats(city, trucks) : null
  },

  /** Other cities of the same region, busiest first — used for "nearby cities" links */
  nearbyWithStats(
    regionSlug: string,
    citySlug: string,
    trucks: TowTruck[],
    limit = 4,
  ): CityWithStats[] {
    return mapWithStats(
      getRegionCities(regionSlug).filter((city) => city.slug !== citySlug),
      trucks,
    )
      .sort((a, b) => b.towTruckCount - a.towTruckCount)
      .slice(0, limit)
  },
}
