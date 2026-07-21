import { citiesService } from '~/services'

export function useCitiesByRegion(regionSlug: string) {
  return useAsyncData(
    `cities-${regionSlug}`,
    () => citiesService.getCitiesByRegionSlug(regionSlug),
    { default: () => [] },
  )
}

export function useCity(regionSlug: string, citySlug: string) {
  return useAsyncData(`city-${regionSlug}-${citySlug}`, () =>
    citiesService.getCityBySlug(regionSlug, citySlug),
  )
}

export function useNearbyCities(regionSlug: string, citySlug: string) {
  return useAsyncData(
    `nearby-cities-${regionSlug}-${citySlug}`,
    () => citiesService.getNearbyCities(regionSlug, citySlug),
    { default: () => [] },
  )
}
