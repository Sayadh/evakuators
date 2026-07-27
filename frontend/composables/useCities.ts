import { citiesService } from '~/services'

/**
 * City lists/details **with tow truck counts**, derived from the single shared
 * `useAllTowTrucks()` fetch.
 *
 * City names/routes only (dropdown options, service-area chips) → use
 * `~/utils/geography.ts` instead and skip the network.
 */

export function useCitiesByRegion(regionSlug: string) {
  return useDerivedFromTowTrucks((trucks) => citiesService.byRegionWithStats(regionSlug, trucks))
}

export function useCity(regionSlug: string, citySlug: string) {
  return useDerivedFromTowTrucks((trucks) =>
    citiesService.findWithStats(regionSlug, citySlug, trucks),
  )
}

export function useNearbyCities(regionSlug: string, citySlug: string) {
  return useDerivedFromTowTrucks((trucks) =>
    citiesService.nearbyWithStats(regionSlug, citySlug, trucks),
  )
}
