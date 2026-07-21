import { districtsService } from '~/services'

export function useDistricts() {
  return useAsyncData('districts', () => districtsService.getDistricts(), { default: () => [] })
}

export function useDistrict(slug: string) {
  return useAsyncData(`district-${slug}`, () => districtsService.getDistrictBySlug(slug))
}

export function useNearbyDistricts(slug: string) {
  return useAsyncData(`nearby-districts-${slug}`, () => districtsService.getNearbyDistricts(slug), {
    default: () => [],
  })
}
