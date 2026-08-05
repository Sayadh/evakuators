import { decimalToNumber } from '../common/coordinates'
import type { TowTruckCardRow, TowTruckCoverageRow } from './tow-trucks.repository'
import type {
  ServiceAreaJson,
  TowTruckApi,
  TowTruckCardApi,
  TowTruckCoverageApi,
  TowTruckWithImages,
} from './tow-truck.types'

const HOURS_24 = 'Շուրջօրյա (24/7)'

/**
 * The one place that decides what "working hours" reads as. Shared by the card
 * and the detail mapper so the two can't drift into showing different text for
 * the same truck.
 */
function buildWorkingHours(works24Hours: boolean, workingHoursText: string | null): string | undefined {
  return works24Hours ? HOURS_24 : (workingHoursText ?? undefined)
}

function buildPricing(truck: TowTruckWithImages): TowTruckApi['pricing'] {
  const pricing: NonNullable<TowTruckApi['pricing']> = {}
  if (truck.priceCityCallout !== null) pricing.cityCallout = truck.priceCityCallout
  if (truck.pricePerKm !== null) pricing.perKm = truck.pricePerKm
  if (truck.priceWaitingPerHour !== null) pricing.waitingPerHour = truck.priceWaitingPerHour
  if (truck.priceNightSurchargePercent !== null)
    pricing.nightSurchargePercent = truck.priceNightSurchargePercent
  if (truck.priceExtraLoading !== null) pricing.extraLoading = truck.priceExtraLoading
  return Object.keys(pricing).length > 0 ? pricing : undefined
}

/**
 * Who is allowed to see the exact parking point.
 *
 * Default `false`, deliberately: `toTowTruckApi` serves both the public
 * profile (`GET /tow-trucks/:slug`) and the driver's own
 * (`GET /my/tow-truck`), so the safe answer has to be the one you get by
 * forgetting to pass anything. A new caller added later leaks nothing until
 * someone writes `includeCoordinates: true` and has to justify it.
 */
export interface TowTruckApiOptions {
  includeCoordinates?: boolean
}

/** DB row → API shape used by the Nuxt frontend */
export function toTowTruckApi(
  truck: TowTruckWithImages,
  options: TowTruckApiOptions = {},
): TowTruckApi {
  return {
    id: truck.id,
    slug: truck.slug,
    driverName: truck.driverName,
    companyName: truck.companyName ?? undefined,
    phone: truck.phone,
    secondaryPhone: truck.secondaryPhone ?? undefined,
    whatsapp: truck.whatsapp ?? undefined,
    telegram: truck.telegram ?? undefined,
    email: truck.email ?? undefined,
    works24Hours: truck.works24Hours,
    // No fake default anymore — if the driver never specified real hours and
    // isn't 24/7, this stays undefined and the frontend hides the line
    // instead of showing a made-up "09:00 – 21:00" for everyone.
    workingHours: buildWorkingHours(truck.works24Hours, truck.workingHoursText),
    workingHoursText: truck.workingHoursText ?? undefined,
    startingPrice: truck.priceCityCallout ?? undefined,
    description: truck.description,
    vehicle: {
      brand: truck.vehicleBrand,
      model: truck.vehicleModel ?? '',
      year: truck.vehicleYear,
      type: truck.vehicleType,
      capacityTons: truck.capacityTons,
      platformLengthM: truck.platformLengthM ?? undefined,
      platformWidthM: truck.platformWidthM ?? undefined,
      winch: truck.winch,
      manipulator: truck.manipulator,
      wheelSkates: truck.wheelSkates,
      // Withheld server-side when the driver opted out, not just hidden by the
      // UI. TowTruckInfo.vue checks `showPlateNumber` before rendering it, but
      // the value was still in the JSON response and in the SSR payload — so a
      // driver who explicitly chose not to publish their plate had it published
      // anyway, one "view source" away.
      plateNumber: truck.showPlateNumber ? (truck.plateNumber ?? undefined) : undefined,
      showPlateNumber: truck.showPlateNumber,
    },
    services: truck.services,
    serviceAreas: (truck.serviceAreas as unknown as ServiceAreaJson[]) ?? [],
    location: {
      regionSlug: truck.regionSlug ?? undefined,
      citySlug: truck.citySlug ?? undefined,
      districtSlug: truck.districtSlug ?? undefined,
      name: truck.locationName,
      // Spread, not two keys holding undefined: a public response must not
      // carry `latitude` at all, and "present but undefined" is a different
      // thing from absent the moment anyone reads the JSON rather than the type.
      ...(options.includeCoordinates
        ? {
            latitude: decimalToNumber(truck.latitude),
            longitude: decimalToNumber(truck.longitude),
          }
        : {}),
    },
    ...(options.includeCoordinates && truck.locationUpdatedAt
      ? { locationUpdatedAt: truck.locationUpdatedAt.toISOString() }
      : {}),
    pricing: buildPricing(truck),
    images: truck.images
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((image) => image.url),
    imageDetails: truck.images
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((image) => ({ id: image.id, url: image.url })),
    updatedAt: truck.updatedAt.toISOString(),
  }
}

/**
 * Narrow row → listing card shape.
 *
 * Everything absent here is absent on purpose — see `TowTruckCardApi`. The
 * biggest omission is the contact set: a list response carries only the main
 * phone and WhatsApp, because those are the two buttons a card has.
 * `telegram`, `email`, `secondaryPhone`, the plate number, platform
 * dimensions, the full price table, the description and every photo past the
 * first are detail-page data, served by `GET /tow-trucks/:slug` one truck at a
 * time.
 */
/**
 * @param rating Approved-review aggregate for THIS truck, or undefined when it
 *   has none. Passed in rather than read here because it comes from a single
 *   grouped query over the whole page (see `TowTrucksService.attachRatings`) —
 *   the mapper stays a pure row → shape function.
 */
export function toTowTruckCardApi(
  truck: TowTruckCardRow,
  rating?: TowTruckCardApi['rating'],
): TowTruckCardApi {
  return {
    id: truck.id,
    slug: truck.slug,
    driverName: truck.driverName,
    companyName: truck.companyName ?? undefined,
    phone: truck.phone,
    whatsapp: truck.whatsapp ?? undefined,
    works24Hours: truck.works24Hours,
    workingHours: buildWorkingHours(truck.works24Hours, truck.workingHoursText),
    startingPrice: truck.priceCityCallout ?? undefined,
    vehicle: {
      brand: truck.vehicleBrand,
      model: truck.vehicleModel ?? '',
      type: truck.vehicleType,
      capacityTons: truck.capacityTons,
      manipulator: truck.manipulator,
    },
    services: truck.services,
    serviceAreas: (truck.serviceAreas as unknown as ServiceAreaJson[]) ?? [],
    location: {
      regionSlug: truck.regionSlug ?? undefined,
      citySlug: truck.citySlug ?? undefined,
      districtSlug: truck.districtSlug ?? undefined,
      name: truck.locationName,
    },
    // Spread, not `rating: rating` — an unrated truck must have no `rating`
    // key at all, not a key holding undefined. See TowTruckCardApi.
    ...(rating ? { rating } : {}),
    // The repository already capped this at one row (`take: 1`, ordered by
    // position). Kept as an array so the frontend's card type stays a strict
    // subset of the full TowTruck type.
    images: truck.images.map((image) => image.url),
    updatedAt: truck.updatedAt.toISOString(),
  }
}

/**
 * Narrow row → coverage record. Drops the `name` from each service area: the
 * frontend resolves Armenian labels from its own static data anyway (see
 * CLAUDE.md), so sending them would be pure weight on a response whose entire
 * purpose is to be small.
 */
export function toTowTruckCoverageApi(truck: TowTruckCoverageRow): TowTruckCoverageApi {
  const areas = (truck.serviceAreas as unknown as ServiceAreaJson[]) ?? []
  return {
    location: {
      regionSlug: truck.regionSlug ?? undefined,
      citySlug: truck.citySlug ?? undefined,
      districtSlug: truck.districtSlug ?? undefined,
    },
    serviceAreas: areas.map((area) => ({ slug: area.slug, type: area.type })),
    works24Hours: truck.works24Hours,
  }
}
