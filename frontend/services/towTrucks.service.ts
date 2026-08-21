import { mockRequest } from './apiClient'
import { mockTowTrucks } from '~/mocks/towTrucks'
import { hasManipulator, isSpecialistVehicleType, publicVehicleTypeCategory } from '~/constants/vehicles'
import { isApiEnabled, towTruckRepository } from '~/repositories'
import { LocationType, VehicleType } from '~/types/enums'
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
      (area.type === LocationType.Route && zoneSlugs.has(area.slug)) ||
      // A marz-wide area matches its own marz and nothing else — the slug IS
      // the region. Only an uncapped driver has one, and the two specialist
      // listings are the only places they are shown; the general listings this
      // predicate also feeds exclude those drivers by vehicle type anyway
      // (`SPECIALIST_VEHICLE_TYPES`), so this cannot widen a city page.
      (area.type === LocationType.Region && area.slug === regionSlug),
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

/**
 * Mock-mode mirror of the backend's general-discovery rule.
 *
 * «Մանիպուլյատոր» and «Ծանր տեխնիկա» are listed on their own landing pages and
 * nowhere else (`SPECIALIST_VEHICLE_TYPES`). The API applies that in Postgres;
 * every mock branch below that stands in for a general listing reads this array
 * instead of `mockTowTrucks`, so the two modes cannot show different drivers —
 * which is the only promise the mock/API switch makes.
 *
 * Computed once at module scope rather than per call: the mock list is a static
 * import and the predicate is pure, so re-filtering on every request would buy
 * nothing.
 */
const generalMockTowTrucks = mockTowTrucks.filter(
  (truck) => !isSpecialistVehicleType(truck.vehicle.type),
)

/**
 * "Is this mock truck of the asked-for vehicle type" — the one predicate every
 * mock branch that takes a `vehicleType` goes through.
 *
 * «Մանիպուլյատոր» is a union of the vehicle type and the equipment checkbox
 * (`hasManipulator`), which is how the backend answers it too. There are now
 * three callers — the country-wide landing page and the two geo listings — and
 * a second copy of that `if` is how one of them ends up disagreeing with the
 * API about the one type where disagreement is possible.
 */
function mockMatchesVehicleType(
  truck: { vehicle: { type: string; manipulator: boolean } },
  vehicleType: VehicleType,
): boolean {
  return vehicleType === VehicleType.Manipulator
    ? hasManipulator(truck.vehicle)
    : truck.vehicle.type === vehicleType
}

/**
 * The mock fleet a geo listing should filter, given what it was asked for.
 *
 * Naming a type lifts the landing-page-only exclusion (see
 * `SPECIALIST_VEHICLE_TYPES`), so `/manipulator/kotayk` starts from the WHOLE
 * mock fleet and narrows by type, while plain `/regions/kotayk` starts from
 * the general one. Getting this backwards empties the geo pages in mock mode
 * and nowhere else, which is the hardest kind of bug to notice.
 */
function mockFleetFor(vehicleType?: VehicleType) {
  if (!vehicleType) return generalMockTowTrucks
  return mockTowTrucks.filter((truck) => mockMatchesVehicleType(truck, vehicleType))
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
    return mockRequest(() => generalMockTowTrucks.map(toMockCoverage))
  },

  getBySlug(slug: string): Promise<TowTruck | null> {
    if (isApiEnabled()) return towTruckRepository.getBySlug(slug)
    return mockRequest(() => mockTowTrucks.find((truck) => truck.slug === slug) ?? null)
  },

  getByCitySlug(citySlug: string, vehicleType?: VehicleType): Promise<TowTruckCard[]> {
    if (isApiEnabled()) return towTruckRepository.getByCity(citySlug, vehicleType)
    return mockRequest(() =>
      mockFleetFor(vehicleType).filter((truck) => servesCity(truck, citySlug)),
    )
  },

  getByDistrictSlug(districtSlug: string, vehicleType?: VehicleType): Promise<TowTruckCard[]> {
    if (isApiEnabled()) return towTruckRepository.getByDistrict(districtSlug, vehicleType)
    return mockRequest(() =>
      mockFleetFor(vehicleType).filter((truck) => servesDistrict(truck, districtSlug)),
    )
  },

  /**
   * Yerevan trucks, those actually based in a district first. A real filtered
   * request again: `/yerevan` renders the trucks themselves, and there is no
   * longer a full in-memory list to derive them from — the counters next to
   * them come from the much smaller coverage endpoint instead.
   */
  async getYerevanTowTrucks(vehicleType?: VehicleType): Promise<TowTruckCard[]> {
    const trucks = isApiEnabled()
      ? await towTruckRepository.getYerevan(vehicleType)
      : await mockRequest(() => mockFleetFor(vehicleType).filter(servesYerevan))
    return [...trucks].sort((a, b) => Number(isBasedInYerevan(b)) - Number(isBasedInYerevan(a)))
  },

  /**
   * Every truck of one vehicle type, country-wide.
   *
   * The mock branch goes through `hasManipulator` rather than comparing the
   * type, so the mocks answer «Մանիպուլյատոր» exactly as the backend does —
   * either the vehicle type or the equipment checkbox. Comparing the type here
   * would make the mock list and the real list disagree about the one vehicle
   * type where that is possible, which is precisely the page most likely to be
   * checked against mocks.
   *
   * The one list branch that still reads `mockTowTrucks` rather than
   * `generalMockTowTrucks`. Naming a type is exactly what lifts the
   * landing-page-only exclusion — see `SPECIALIST_VEHICLE_TYPES` — and
   * filtering it out here would empty both landing pages.
   */
  getByVehicleType(vehicleType: VehicleType): Promise<TowTruckCard[]> {
    if (isApiEnabled()) return towTruckRepository.getByVehicleType(vehicleType)
    return mockRequest(() => mockFleetFor(vehicleType))
  },

  /**
   * Drivers on one road corridor. Exact match, no fallback — see `servesZone`.
   */
  getByZoneSlug(zoneSlug: string): Promise<TowTruckCard[]> {
    if (isApiEnabled()) return towTruckRepository.getByZone(zoneSlug)
    return mockRequest(() => generalMockTowTrucks.filter((truck) => servesZone(truck, zoneSlug)))
  },

  async getByRegionSlug(regionSlug: string, vehicleType?: VehicleType): Promise<TowTruckCard[]> {
    const trucks = isApiEnabled()
      ? await towTruckRepository.getByRegion(
          regionSlug,
          getRegionCitySlugs(regionSlug),
          getRegionServiceZoneSlugs(regionSlug),
          vehicleType,
        )
      : await mockRequest(() =>
          mockFleetFor(vehicleType).filter((truck) => servesRegion(truck, regionSlug)),
        )
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
    return mockRequest(() => [...generalMockTowTrucks].sort(by24Hours).slice(0, limit))
  },

  /**
   * Trucks serving the same base location, excluding the truck itself.
   *
   * Narrowed to the same vehicle-type category the truck being viewed belongs
   * to, for «Մանիպուլյատոր» and «Ծանր տեխնիկա» — without this, a manipulator's
   * own profile page recommended ordinary flatbed evacuators nearby, which
   * answers a different question than the one a visitor on that profile is
   * asking. Plain evacuators (the general-discovery case) get no narrowing:
   * `undefined` here means "the geo call's default", exactly as it does for
   * `getByVehicleType`/`getByRegionSlug`.
   *
   * See `publicVehicleTypeCategory` for why `heavyEquipment` (the admin-set
   * flag half of the «Ծանր տեխնիկա» union) is not, and cannot be, read here.
   */
  async getSimilar(truck: TowTruck, limit = 3): Promise<TowTruckCard[]> {
    const { districtSlug, citySlug } = truck.location
    if (!districtSlug && !citySlug) return []

    const vehicleType = publicVehicleTypeCategory(truck.vehicle)

    const candidates = districtSlug
      ? await towTrucksService.getByDistrictSlug(districtSlug, vehicleType)
      : await towTrucksService.getByCitySlug(citySlug as string, vehicleType)

    return candidates.filter((candidate) => candidate.id !== truck.id).slice(0, limit)
  },
}
