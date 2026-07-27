import { districtsService } from '~/services'

/**
 * Yerevan district lists/details **with tow truck counts**, derived from the
 * single shared `useAllTowTrucks()` fetch.
 *
 * District names/routes only → use `~/utils/geography.ts` instead.
 */

export function useDistricts() {
  return useDerivedFromTowTrucks((trucks) => districtsService.allWithStats(trucks))
}

export function useDistrict(slug: string) {
  return useDerivedFromTowTrucks((trucks) => districtsService.findWithStats(slug, trucks))
}

export function useNearbyDistricts(slug: string) {
  return useDerivedFromTowTrucks((trucks) => districtsService.nearbyWithStats(slug, trucks))
}
