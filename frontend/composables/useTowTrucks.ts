import { towTrucksService } from '~/services'
import type { TowTruck } from '~/types/towTruck'

export function useTowTrucksByCity(citySlug: string) {
  return useAsyncData(`tow-trucks-city-${citySlug}`, () => towTrucksService.getByCitySlug(citySlug), {
    default: () => [],
  })
}

export function useTowTrucksByDistrict(districtSlug: string) {
  return useAsyncData(
    `tow-trucks-district-${districtSlug}`,
    () => towTrucksService.getByDistrictSlug(districtSlug),
    { default: () => [] },
  )
}

export function useTowTruck(slug: string) {
  return useAsyncData(`tow-truck-${slug}`, () => towTrucksService.getBySlug(slug))
}

export function useFeaturedTowTrucks(limit = 6) {
  return useAsyncData(`featured-tow-trucks-${limit}`, () => towTrucksService.getFeatured(limit), {
    default: () => [],
  })
}

export function useTowTrucksInYerevan() {
  return useAsyncData('tow-trucks-yerevan', () => towTrucksService.getYerevanTowTrucks(), {
    default: () => [],
  })
}

export function useTowTrucksByRegion(regionSlug: string) {
  return useAsyncData(
    `tow-trucks-region-${regionSlug}`,
    () => towTrucksService.getByRegionSlug(regionSlug),
    { default: () => [] },
  )
}

export function useSimilarTowTrucks(truck: TowTruck) {
  return useAsyncData(`similar-tow-trucks-${truck.slug}`, () => towTrucksService.getSimilar(truck), {
    default: () => [],
  })
}
