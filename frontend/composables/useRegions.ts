import { regionsService } from '~/services'

/**
 * Region lists/details **with tow truck counts**, all derived from the single
 * shared `useAllTowTrucks()` fetch — see that file for why this matters.
 *
 * If you only need a region's name or route, don't use these: import from
 * `~/utils/geography.ts` instead and skip the network entirely.
 */

export function useRegions() {
  return useDerivedFromTowTrucks((trucks) => regionsService.allWithStats(trucks))
}

export function useRegion(slug: string) {
  return useDerivedFromTowTrucks((trucks) => regionsService.findWithStats(slug, trucks))
}

export function useNearbyRegions(slug: string) {
  return useDerivedFromTowTrucks((trucks) => regionsService.nearbyWithStats(slug, trucks))
}
