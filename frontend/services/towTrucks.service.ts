import { mockRequest } from './apiClient'
import { staticCities } from '~/data/cities'
import { staticRegions } from '~/data/regions'
import { mockTowTrucks } from '~/mocks/towTrucks'
import { isApiEnabled, towTruckRepository } from '~/repositories'
import { LocationType } from '~/types/enums'
import type { TowTruck } from '~/types/towTruck'

/* ── Pure matchers (shared with the location services for stats) ── */

/** A truck serves a city if it is based there or lists it as a service area */
export function servesCity(truck: TowTruck, citySlug: string): boolean {
  return (
    truck.location.citySlug === citySlug ||
    truck.serviceAreas.some((area) => area.type === LocationType.City && area.slug === citySlug)
  )
}

export function servesDistrict(truck: TowTruck, districtSlug: string): boolean {
  return (
    truck.location.districtSlug === districtSlug ||
    truck.serviceAreas.some(
      (area) => area.type === LocationType.District && area.slug === districtSlug,
    )
  )
}

export function isBasedInRegion(truck: TowTruck, regionSlug: string): boolean {
  return truck.location.regionSlug === regionSlug
}

function getRegionCitySlugs(regionSlug: string): string[] {
  const region = staticRegions.find((item) => item.slug === regionSlug)
  if (!region) return []
  return staticCities.filter((city) => city.regionId === region.id).map((city) => city.slug)
}

/**
 * A truck is related to a region if it is based there
 * or lists any of the region's cities as a service area.
 */
export function servesRegion(truck: TowTruck, regionSlug: string): boolean {
  if (isBasedInRegion(truck, regionSlug)) return true
  const citySlugs = new Set(getRegionCitySlugs(regionSlug))
  return truck.serviceAreas.some(
    (area) => area.type === LocationType.City && citySlugs.has(area.slug),
  )
}

export function isBasedInYerevan(truck: TowTruck): boolean {
  return Boolean(truck.location.districtSlug)
}

/** A truck is related to Yerevan if it is based in a district or serves any district */
export function servesYerevan(truck: TowTruck): boolean {
  return (
    isBasedInYerevan(truck) ||
    truck.serviceAreas.some((area) => area.type === LocationType.District)
  )
}

const by24Hours = (a: TowTruck, b: TowTruck): number =>
  Number(b.works24Hours) - Number(a.works24Hours)

/**
 * Data source switch: with a configured API base every method hits the
 * backend through `towTruckRepository`; otherwise it reads local mock data.
 * UI code never knows the difference.
 */
export const towTrucksService = {
  getAll(): Promise<TowTruck[]> {
    if (isApiEnabled()) return towTruckRepository.getAll()
    return mockRequest(() => mockTowTrucks)
  },

  getBySlug(slug: string): Promise<TowTruck | null> {
    if (isApiEnabled()) return towTruckRepository.getBySlug(slug)
    return mockRequest(() => mockTowTrucks.find((truck) => truck.slug === slug) ?? null)
  },

  getByCitySlug(citySlug: string): Promise<TowTruck[]> {
    if (isApiEnabled()) return towTruckRepository.getByCity(citySlug)
    return mockRequest(() => mockTowTrucks.filter((truck) => servesCity(truck, citySlug)))
  },

  getByDistrictSlug(districtSlug: string): Promise<TowTruck[]> {
    if (isApiEnabled()) return towTruckRepository.getByDistrict(districtSlug)
    return mockRequest(() => mockTowTrucks.filter((truck) => servesDistrict(truck, districtSlug)))
  },

  async getYerevanTowTrucks(): Promise<TowTruck[]> {
    const trucks = isApiEnabled()
      ? await towTruckRepository.getYerevan()
      : await mockRequest(() => mockTowTrucks.filter(servesYerevan))
    return [...trucks].sort((a, b) => Number(isBasedInYerevan(b)) - Number(isBasedInYerevan(a)))
  },

  async getByRegionSlug(regionSlug: string): Promise<TowTruck[]> {
    const trucks = isApiEnabled()
      ? await towTruckRepository.getByRegion(regionSlug, getRegionCitySlugs(regionSlug))
      : await mockRequest(() => mockTowTrucks.filter((truck) => servesRegion(truck, regionSlug)))
    return [...trucks].sort(
      (a, b) => Number(isBasedInRegion(b, regionSlug)) - Number(isBasedInRegion(a, regionSlug)),
    )
  },

  async getFeatured(limit = 6): Promise<TowTruck[]> {
    const trucks = await towTrucksService.getAll()
    return [...trucks].sort(by24Hours).slice(0, limit)
  },

  /** Trucks serving the same base location, excluding the truck itself */
  async getSimilar(truck: TowTruck, limit = 3): Promise<TowTruck[]> {
    const { districtSlug, citySlug } = truck.location
    if (!districtSlug && !citySlug) return []

    const candidates = districtSlug
      ? await towTrucksService.getByDistrictSlug(districtSlug)
      : await towTrucksService.getByCitySlug(citySlug as string)

    return candidates.filter((candidate) => candidate.id !== truck.id).slice(0, limit)
  },
}
