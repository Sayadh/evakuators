import { regionsService } from '~/services'

export function useRegions() {
  return useAsyncData('regions', () => regionsService.getRegions(), { default: () => [] })
}

export function useRegion(slug: string) {
  return useAsyncData(`region-${slug}`, () => regionsService.getRegionBySlug(slug))
}

export function useNearbyRegions(slug: string) {
  return useAsyncData(`nearby-regions-${slug}`, () => regionsService.getNearbyRegions(slug), {
    default: () => [],
  })
}
