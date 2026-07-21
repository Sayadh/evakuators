import { servesCity, towTrucksService } from './towTrucks.service'
import { staticCities } from '~/data/cities'
import { staticRegions } from '~/data/regions'
import type { City, CityWithStats } from '~/types/location'
import type { TowTruck } from '~/types/towTruck'

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

/**
 * Cities are STATIC frontend data; only the tow truck stats are dynamic
 * and come from the tow trucks service (mock or API — same code path).
 */
export const citiesService = {
  async getAllCities(): Promise<CityWithStats[]> {
    const trucks = await towTrucksService.getAll()
    return staticCities
      .map((city) => withStats(city, trucks))
      .filter((city): city is CityWithStats => city !== null)
  },

  async getCitiesByRegionSlug(regionSlug: string): Promise<CityWithStats[]> {
    const region = staticRegions.find((item) => item.slug === regionSlug)
    if (!region) return []

    const trucks = await towTrucksService.getAll()
    return staticCities
      .filter((city) => city.regionId === region.id)
      .map((city) => withStats(city, trucks))
      .filter((city): city is CityWithStats => city !== null)
  },

  async getCityBySlug(regionSlug: string, citySlug: string): Promise<CityWithStats | null> {
    const region = staticRegions.find((item) => item.slug === regionSlug)
    if (!region) return null

    const city = staticCities.find((item) => item.regionId === region.id && item.slug === citySlug)
    if (!city) return null

    const trucks = await towTrucksService.getAll()
    return withStats(city, trucks)
  },

  /** Other cities of the same region — used for "nearby cities" links */
  async getNearbyCities(
    regionSlug: string,
    citySlug: string,
    limit = 4,
  ): Promise<CityWithStats[]> {
    const region = staticRegions.find((item) => item.slug === regionSlug)
    if (!region) return []

    const trucks = await towTrucksService.getAll()
    return staticCities
      .filter((city) => city.regionId === region.id && city.slug !== citySlug)
      .map((city) => withStats(city, trucks))
      .filter((city): city is CityWithStats => city !== null)
      .sort((a, b) => b.towTruckCount - a.towTruckCount)
      .slice(0, limit)
  },
}
