import { servesDistrict } from './towTrucks.service'
import type { District, DistrictWithStats } from '~/types/location'
import type { TowTruck } from '~/types/towTruck'
import { findStaticDistrict, getStaticDistricts } from '~/utils/geography'

/**
 * Yerevan district statistics — pure and synchronous, same contract as
 * `regionsService`: the caller supplies the already-fetched tow truck list.
 * District *names* come from `~/utils/geography.ts` and need no truck data.
 */

function withStats(district: District, trucks: TowTruck[]): DistrictWithStats {
  const serving = trucks.filter((truck) => servesDistrict(truck, district.slug))
  return {
    ...district,
    towTruckCount: serving.length,
    towTruck24hCount: serving.filter((truck) => truck.works24Hours).length,
  }
}

export const districtsService = {
  allWithStats(trucks: TowTruck[]): DistrictWithStats[] {
    return getStaticDistricts().map((district) => withStats(district, trucks))
  },

  findWithStats(districtSlug: string, trucks: TowTruck[]): DistrictWithStats | null {
    const district = findStaticDistrict(districtSlug)
    return district ? withStats(district, trucks) : null
  },

  /** Busiest other districts — used for "nearby districts" links */
  nearbyWithStats(districtSlug: string, trucks: TowTruck[], limit = 4): DistrictWithStats[] {
    return getStaticDistricts()
      .filter((district) => district.slug !== districtSlug)
      .map((district) => withStats(district, trucks))
      .sort((a, b) => b.towTruckCount - a.towTruckCount)
      .slice(0, limit)
  },
}
