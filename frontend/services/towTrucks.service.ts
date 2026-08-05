import { mockRequest } from './apiClient'
import { mockTowTrucks } from '~/mocks/towTrucks'
import { isApiEnabled, towTruckRepository } from '~/repositories'
import { LocationType } from '~/types/enums'
import type {
  TowTruck,
  TowTruckCard,
  TowTruckCoverage,
  TowTruckGeography,
} from '~/types/towTruck'
import { getRegionCitySlugs, getRegionServiceZoneSlugs } from '~/utils/geography'

/* ── Pure matchers ────────────────────────────────────────────────────────
 *
 * Typed against `TowTruckGeography`, the smallest shape that answers "where
 * does this truck work" — so the same predicates run over a full card and over
 * a bare `/tow-trucks/coverage` record. That is the whole reason the coverage
 * endpoint mirrors the card's `location`/`serviceAreas` nesting instead of
 * being flat: one set of rules, no second implementation to drift.
 */

/** A truck serves a city if it is based there or lists it as a service area */
export function servesCity(truck: TowTruckGeography, citySlug: string): boolean {
  return (
    truck.location.citySlug === citySlug ||
    truck.serviceAreas.some((area) => area.type === LocationType.City && area.slug === citySlug)
  )
}

export function servesDistrict(truck: TowTruckGeography, districtSlug: string): boolean {
  return (
    truck.location.districtSlug === districtSlug ||
    truck.serviceAreas.some(
      (area) => area.type === LocationType.District && area.slug === districtSlug,
    )
  )
}

/**
 * A truck serves a road corridor only if it listed that exact corridor.
 *
 * No `location` fallback and no expansion, unlike `servesCity`: a corridor is
 * not a place a truck is based in, and «Գառնի–Գեղարդ» implies nothing about
 * Գառնի, Գեղարդ or anything between them. The driver named a road; that road
 * is what they are matched on.
 */
export function servesZone(truck: TowTruckGeography, zoneSlug: string): boolean {
  return truck.serviceAreas.some(
    (area) => area.type === LocationType.Route && area.slug === zoneSlug,
  )
}

export function isBasedInRegion(truck: TowTruckGeography, regionSlug: string): boolean {
  return truck.location.regionSlug === regionSlug
}

/**
 * A truck is related to a region if it is based there, or lists any of the
 * region's cities **or road corridors** as a service area.
 *
 * Corridors count here — and only here — for the same reason cities do: a
 * driver whose whole coverage is «Գառնի–Գեղարդ» genuinely works in Kotayk, and
 * leaving them out of Kotayk's own listing would make them findable only by
 * someone who already knew to pick that corridor. This is the one rollup; it
 * does not make them match any individual city.
 */
export function servesRegion(truck: TowTruckGeography, regionSlug: string): boolean {
  if (isBasedInRegion(truck, regionSlug)) return true

  const citySlugs = new Set(getRegionCitySlugs(regionSlug))
  const zoneSlugs = new Set(getRegionServiceZoneSlugs(regionSlug))

  return truck.serviceAreas.some(
    (area) =>
      (area.type === LocationType.City && citySlugs.has(area.slug)) ||
      (area.type === LocationType.Route && zoneSlugs.has(area.slug)),
  )
}

export function isBasedInYerevan(truck: TowTruckGeography): boolean {
  return Boolean(truck.location.districtSlug)
}

/** A truck is related to Yerevan if it is based in a district or serves any district */
export function servesYerevan(truck: TowTruckGeography): boolean {
  return (
    isBasedInYerevan(truck) ||
    truck.serviceAreas.some((area) => area.type === LocationType.District)
  )
}

const by24Hours = (a: TowTruckCard, b: TowTruckCard): number =>
  Number(b.works24Hours) - Number(a.works24Hours)

/** Mock-mode stand-in for `GET /tow-trucks/coverage` */
function toMockCoverage(truck: TowTruck): TowTruckCoverage {
  return {
    location: {
      regionSlug: truck.location.regionSlug,
      citySlug: truck.location.citySlug,
      districtSlug: truck.location.districtSlug,
    },
    serviceAreas: truck.serviceAreas.map((area) => ({ slug: area.slug, type: area.type })),
    works24Hours: truck.works24Hours,
  }
}

/**
 * Data source switch: with a configured API base every method hits the
 * backend through `towTruckRepository`; otherwise it reads local mock data.
 * UI code never knows the difference.
 *
 * Note the return types — every list method yields `TowTruckCard`, the smaller
 * shape the backend serves for listings. Only `getBySlug` returns a full
 * `TowTruck`.
 */
export const towTrucksService = {
  /**
   * Geography footprint of every active truck, for the region/city/district
   * counters. Replaced `getAll()`, which pulled the entire fleet — contacts,
   * descriptions, photo URLs and all — so a card could print a number.
   */
  getCoverage(): Promise<TowTruckCoverage[]> {
    if (isApiEnabled()) return towTruckRepository.getCoverage()
    return mockRequest(() => mockTowTrucks.map(toMockCoverage))
  },

  getBySlug(slug: string): Promise<TowTruck | null> {
    if (isApiEnabled()) return towTruckRepository.getBySlug(slug)
    return mockRequest(() => mockTowTrucks.find((truck) => truck.slug === slug) ?? null)
  },

  getByCitySlug(citySlug: string): Promise<TowTruckCard[]> {
    if (isApiEnabled()) return towTruckRepository.getByCity(citySlug)
    return mockRequest(() => mockTowTrucks.filter((truck) => servesCity(truck, citySlug)))
  },

  getByDistrictSlug(districtSlug: string): Promise<TowTruckCard[]> {
    if (isApiEnabled()) return towTruckRepository.getByDistrict(districtSlug)
    return mockRequest(() => mockTowTrucks.filter((truck) => servesDistrict(truck, districtSlug)))
  },

  /**
   * Yerevan trucks, those actually based in a district first. A real filtered
   * request again: `/yerevan` renders the trucks themselves, and there is no
   * longer a full in-memory list to derive them from — the counters next to
   * them come from the much smaller coverage endpoint instead.
   */
  async getYerevanTowTrucks(): Promise<TowTruckCard[]> {
    const trucks = isApiEnabled()
      ? await towTruckRepository.getYerevan()
      : await mockRequest(() => mockTowTrucks.filter(servesYerevan))
    return [...trucks].sort((a, b) => Number(isBasedInYerevan(b)) - Number(isBasedInYerevan(a)))
  },

  /**
   * Drivers on one road corridor. Exact match, no fallback — see `servesZone`.
   */
  getByZoneSlug(zoneSlug: string): Promise<TowTruckCard[]> {
    if (isApiEnabled()) return towTruckRepository.getByZone(zoneSlug)
    return mockRequest(() => mockTowTrucks.filter((truck) => servesZone(truck, zoneSlug)))
  },

  async getByRegionSlug(regionSlug: string): Promise<TowTruckCard[]> {
    const trucks = isApiEnabled()
      ? await towTruckRepository.getByRegion(
          regionSlug,
          getRegionCitySlugs(regionSlug),
          getRegionServiceZoneSlugs(regionSlug),
        )
      : await mockRequest(() => mockTowTrucks.filter((truck) => servesRegion(truck, regionSlug)))
    return [...trucks].sort(
      (a, b) => Number(isBasedInRegion(b, regionSlug)) - Number(isBasedInRegion(a, regionSlug)),
    )
  },

  /**
   * Admin-curated "best tow trucks" pick (see /admin panel). Real backend:
   * only trucks explicitly marked `isFeatured`, empty when the admin hasn't
   * marked any — the homepage section then hides itself entirely. Mock mode
   * has no such flag to read, so it falls back to a small illustrative
   * sample for local/design preview only.
   */
  async getFeatured(limit = 6): Promise<TowTruckCard[]> {
    if (isApiEnabled()) return towTruckRepository.getFeatured()
    return mockRequest(() => [...mockTowTrucks].sort(by24Hours).slice(0, limit))
  },

  /** Trucks serving the same base location, excluding the truck itself */
  async getSimilar(truck: TowTruck, limit = 3): Promise<TowTruckCard[]> {
    const { districtSlug, citySlug } = truck.location
    if (!districtSlug && !citySlug) return []

    const candidates = districtSlug
      ? await towTrucksService.getByDistrictSlug(districtSlug)
      : await towTrucksService.getByCitySlug(citySlug as string)

    return candidates.filter((candidate) => candidate.id !== truck.id).slice(0, limit)
  },
}
