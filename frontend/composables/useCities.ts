import { citiesService } from '~/services'

/**
 * City lists/details **with tow truck counts**, derived from the single shared
 * `useTowTruckCoverage()` fetch.
 *
 * City names/routes only (dropdown options, service-area chips) → use
 * `~/utils/geography.ts` instead and skip the network.
 */

export function useCitiesByRegion(regionSlug: string) {
  return useDerivedFromCoverage((trucks) => citiesService.byRegionWithStats(regionSlug, trucks))
}

export function useCity(regionSlug: string, citySlug: string) {
  return useDerivedFromCoverage((trucks) =>
    citiesService.findWithStats(regionSlug, citySlug, trucks),
  )
}

export function useNearbyCities(regionSlug: string, citySlug: string) {
  return useDerivedFromCoverage((trucks) =>
    citiesService.nearbyWithStats(regionSlug, citySlug, trucks),
  )
}
