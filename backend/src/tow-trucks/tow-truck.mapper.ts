import type { TowTruckApi, TowTruckWithImages, ServiceAreaJson } from './tow-truck.types'

const HOURS_24 = 'Շուրջօրյա (24/7)'

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

/** DB row → API shape used by the Nuxt frontend */
export function toTowTruckApi(truck: TowTruckWithImages): TowTruckApi {
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
    workingHours: truck.works24Hours ? HOURS_24 : (truck.workingHoursText ?? undefined),
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
      plateNumber: truck.plateNumber ?? undefined,
      showPlateNumber: truck.showPlateNumber,
    },
    services: truck.services,
    serviceAreas: (truck.serviceAreas as unknown as ServiceAreaJson[]) ?? [],
    location: {
      regionSlug: truck.regionSlug ?? undefined,
      citySlug: truck.citySlug ?? undefined,
      districtSlug: truck.districtSlug ?? undefined,
      name: truck.locationName,
    },
    pricing: buildPricing(truck),
    images: truck.images
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((image) => image.url),
    updatedAt: truck.updatedAt.toISOString(),
  }
}
