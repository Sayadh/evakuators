import { servesRegion, towTrucksService } from './towTrucks.service'
import { staticCities } from '~/data/cities'
import { staticRegions } from '~/data/regions'
import type { Region, RegionWithStats } from '~/types/location'
import type { TowTruck } from '~/types/towTruck'

function withStats(region: Region, trucks: TowTruck[]): RegionWithStats {
  return {
    ...region,
    cityCount: staticCities.filter((city) => city.regionId === region.id).length,
    towTruckCount: trucks.filter((truck) => servesRegion(truck, region.slug)).length,
  }
}

export const regionsService = {
  async getRegions(): Promise<RegionWithStats[]> {
    const trucks = await towTrucksService.getAll()
    return staticRegions.map((region) => withStats(region, trucks))
  },

  async getRegionBySlug(slug: string): Promise<RegionWithStats | null> {
    const region = staticRegions.find((item) => item.slug === slug)
    if (!region) return null

    const trucks = await towTrucksService.getAll()
    return withStats(region, trucks)
  },

  async getNearbyRegions(slug: string, limit = 4): Promise<RegionWithStats[]> {
    const trucks = await towTrucksService.getAll()
    return staticRegions
      .filter((region) => region.slug !== slug)
      .slice(0, limit)
      .map((region) => withStats(region, trucks))
  },
}
