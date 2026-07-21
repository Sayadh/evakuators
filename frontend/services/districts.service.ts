import { servesDistrict, towTrucksService } from './towTrucks.service'
import { staticDistricts } from '~/data/districts'
import type { District, DistrictWithStats } from '~/types/location'
import type { TowTruck } from '~/types/towTruck'

function withStats(district: District, trucks: TowTruck[]): DistrictWithStats {
  const serving = trucks.filter((truck) => servesDistrict(truck, district.slug))
  return {
    ...district,
    towTruckCount: serving.length,
    towTruck24hCount: serving.filter((truck) => truck.works24Hours).length,
  }
}

export const districtsService = {
  async getDistricts(): Promise<DistrictWithStats[]> {
    const trucks = await towTrucksService.getAll()
    return staticDistricts.map((district) => withStats(district, trucks))
  },

  async getDistrictBySlug(slug: string): Promise<DistrictWithStats | null> {
    const district = staticDistricts.find((item) => item.slug === slug)
    if (!district) return null

    const trucks = await towTrucksService.getAll()
    return withStats(district, trucks)
  },

  async getNearbyDistricts(slug: string, limit = 4): Promise<DistrictWithStats[]> {
    const trucks = await towTrucksService.getAll()
    return staticDistricts
      .filter((district) => district.slug !== slug)
      .map((district) => withStats(district, trucks))
      .sort((a, b) => b.towTruckCount - a.towTruckCount)
      .slice(0, limit)
  },
}
