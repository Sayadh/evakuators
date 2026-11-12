/**
 * The driver's website profile as an editable form, and back.
 *
 * A port of `frontend/pages/dashboard.vue` (`fillFormFromTruck` and the
 * payload built in `submit()`), keeping every rule it states — the stored base
 * is carried, never chosen; a cleared contact field is sent as '' so it is
 * cleared; a band becomes a representative tonnage unless an exact figure was
 * given; coverage names are resolved here because the backend has no
 * geography. The building blocks are the website's own functions, imported;
 * only the glue is repeated, and `test/profileForm.test.ts` pins it.
 *
 * The form reuses the REGISTRATION form's state shape (brand/model/year…) so
 * the app has one set of field components for sign-up and for editing.
 */
import type { TowTruck } from '~/types/towTruck'
import { LocationType } from '~/types/enums'
import { capacityRangeFromTons, representativeCapacityTons } from '~/constants/vehicles'
import { hasUncappedCoverage, validateServiceAreaSelection } from '~/constants/serviceAreaLimits'
import { createRegistrationFormState, numberFieldText, validateRegistrationForm, isAvailable247 } from '~/utils/registrationForm'
import { toOptionalFloat, type RegistrationFormState } from '~/utils/registrationPayload'
import { formatWorkingHoursRange, splitWorkingHoursRange } from '~/utils/workingHours'
import { baseCandidatesFor, buildServiceAreas } from '~/utils/serviceAreas'
import { findCityLocation, findServiceZoneLocation, resolveAreaType, YEREVAN_REGION_SLUG } from '~/utils/geography'
import { formatCoordinates } from '~/utils/coordinates'
import type { FormErrors } from '../forms/state'

export interface ProfileForm extends RegistrationFormState {
  driverName: string
  description: string
  locationName: string
  /** The stored base — read-only for the driver (see dashboard.vue `chosenBaseSlug`) */
  baseSlug: string
}

export function profileToForm(data: TowTruck): ProfileForm {
  const { start, end } = splitWorkingHoursRange(data.workingHoursText)
  return {
    ...createRegistrationFormState(),
    driverName: data.driverName,
    description: data.description ?? '',
    locationName: data.location.name,
    baseSlug: data.location.citySlug ?? data.location.districtSlug ?? '',
    phone: data.phone,
    companyName: data.companyName ?? '',
    secondaryPhone: data.secondaryPhone ?? '',
    whatsapp: data.whatsapp ?? '',
    telegram: data.telegram ?? '',
    brand: data.vehicle.brand,
    model: data.vehicle.model ?? '',
    year: String(data.vehicle.year),
    vehicleType: data.vehicle.type,
    capacity: capacityRangeFromTons(data.vehicle.capacityTons),
    platformLengthM: numberFieldText(data.vehicle.platformLengthM),
    platformWidthM: numberFieldText(data.vehicle.platformWidthM),
    craneCapacityTons: numberFieldText(data.vehicle.craneCapacityTons),
    craneReachM: numberFieldText(data.vehicle.craneReachM),
    maxLoadTons: numberFieldText(data.vehicle.maxLoadTons),
    platformLoadHeightCm: numberFieldText(data.vehicle.platformLoadHeightCm),
    winch: data.vehicle.winch,
    manipulator: data.vehicle.manipulator,
    wheelSkates: data.vehicle.wheelSkates,
    doubleDeck: data.vehicle.doubleDeck,
    towHitch: data.vehicle.towHitch,
    heavyEquipment: data.vehicle.heavyEquipment ?? false,
    servesAllArmenia: data.servesAllArmenia,
    services: [...data.services],
    workingHoursStart: start,
    workingHoursEnd: end,
    // A marz-wide area is coverage, not a city — see dashboard.vue for the
    // three bugs each of these branches once was.
    citySlugs: data.serviceAreas.filter((area) => area.type !== LocationType.Region).map((area) => area.slug),
    regionSlugs: [
      ...new Set(
        data.serviceAreas
          .map((area) => {
            if (area.type === LocationType.Region) return area.slug
            if (area.type === LocationType.District) return YEREVAN_REGION_SLUG
            if (area.type === LocationType.Route) return findServiceZoneLocation(area.slug)?.regionSlug
            return findCityLocation(area.slug)?.regionSlug
          })
          .filter((slug): slug is string => Boolean(slug)),
      ),
    ],
    coordinates:
      typeof data.location.latitude === 'number' && typeof data.location.longitude === 'number'
        ? formatCoordinates(data.location.latitude, data.location.longitude)
        : '',
    priceCityCallout: numberFieldText(data.pricing?.cityCallout),
    pricePerKm: numberFieldText(data.pricing?.perKm),
    priceWaitingPerHour: numberFieldText(data.pricing?.waitingPerHour),
    priceNightSurchargePercent: numberFieldText(data.pricing?.nightSurchargePercent),
    priceExtraLoading: numberFieldText(data.pricing?.extraLoading),
  }
}

/** The first selected area that is an actual place (a corridor is not) — dashboard.vue `findPlaceSlug` */
function findPlaceSlug(slugs: string[]): string | undefined {
  return slugs.find((slug) => resolveAreaType(slug) !== LocationType.Route)
}

export function basePlaceSlug(form: ProfileForm): string | undefined {
  return form.baseSlug || (hasUncappedCoverage(form) ? undefined : findPlaceSlug(form.citySlugs))
}

/**
 * The website's rules for the fields a dashboard edits. Registration's
 * validator is run with the three answers a profile no longer asks
 * (first/last name, main phone) filled in, so every other rule is literally
 * the same function; then the dashboard's own two rules are added.
 */
export function validateProfileForm(form: ProfileForm, errors: FormErrors, language: string): boolean {
  validateRegistrationForm({ ...form, firstName: '-', lastName: '-', phone: '+37400000000', coordinates: '' }, errors, language)
  delete errors.firstName
  delete errors.lastName
  delete errors.phone
  delete errors.coordinates
  errors.driverName = form.driverName.trim() ? '' : language === 'ru' ? 'Укажите имя и фамилию' : 'Լրացրեք Անուն Ազգանունը'
  errors.citySlugs = validateServiceAreaSelection(form.regionSlugs, form.citySlugs, form, language)
  // UpdateMyTowTruckDto: @MinLength(20) @MaxLength(2000)
  const description = form.description.trim().length
  errors.description =
    description < 20 || description > 2000 ? (language === 'ru' ? 'Описание — от 20 до 2000 символов' : 'Նկարագրությունը՝ 20-ից 2000 նիշ') : ''
  const candidates = baseCandidatesFor(form)
  errors.baseSlug =
    form.baseSlug && !candidates.some((candidate) => candidate.slug === form.baseSlug)
      ? language === 'ru'
        ? `${form.locationName} — ваше основное место, оно должно оставаться в зонах обслуживания`
        : `${form.locationName} — ձեր հիմնական վայրն է, այն պետք է մնա սպասարկվող տարածքների մեջ`
      : ''
  return Object.values(errors).every((error) => !error)
}

const toOptionalInt = (value: string): number | undefined => {
  const trimmed = value.trim()
  return trimmed ? Number(trimmed) : undefined
}

/** `UpdateMyTowTruckDto`, exactly as dashboard.vue builds it */
export function buildProfileUpdate(form: ProfileForm, imageIds?: number[]): Record<string, unknown> {
  const primarySlug = basePlaceSlug(form)
  const primaryType = primarySlug ? resolveAreaType(primarySlug) : undefined
  const hasFullHours = Boolean(form.workingHoursStart) && Boolean(form.workingHoursEnd)
  return {
    driverName: form.driverName.trim(),
    // '' clears a field, an omitted key leaves it alone — see dashboard.vue.
    companyName: form.companyName.trim(),
    secondaryPhone: form.secondaryPhone.trim(),
    whatsapp: form.whatsapp.trim(),
    telegram: form.telegram.trim(),
    vehicleBrand: form.brand.trim(),
    vehicleModel: form.model.trim() || undefined,
    vehicleYear: Number(form.year),
    vehicleType: form.vehicleType || undefined,
    capacityTons: toOptionalFloat(form.maxLoadTons) ?? representativeCapacityTons(form.capacity),
    platformLengthM: toOptionalFloat(form.platformLengthM),
    platformWidthM: toOptionalFloat(form.platformWidthM),
    craneCapacityTons: toOptionalFloat(form.craneCapacityTons),
    craneReachM: toOptionalFloat(form.craneReachM),
    maxLoadTons: toOptionalFloat(form.maxLoadTons),
    platformLoadHeightCm: toOptionalFloat(form.platformLoadHeightCm),
    winch: form.winch,
    manipulator: form.manipulator,
    wheelSkates: form.wheelSkates,
    doubleDeck: form.doubleDeck,
    towHitch: form.towHitch,
    heavyEquipment: form.heavyEquipment,
    servesAllArmenia: form.servesAllArmenia,
    description: form.description.trim(),
    services: form.services,
    workingHoursText: isAvailable247(form.services) || !hasFullHours ? undefined : formatWorkingHoursRange(form.workingHoursStart, form.workingHoursEnd),
    locationName: form.locationName.trim(),
    serviceAreas: buildServiceAreas({ ...form, baseSlug: primarySlug }),
    regionSlugs: form.regionSlugs,
    ...(primaryType === LocationType.District
      ? { districtSlug: primarySlug }
      : primaryType === LocationType.City
        ? { citySlug: primarySlug, regionSlug: findCityLocation(primarySlug as string)?.regionSlug }
        : {}),
    priceCityCallout: toOptionalInt(form.priceCityCallout),
    pricePerKm: toOptionalInt(form.pricePerKm),
    priceWaitingPerHour: toOptionalInt(form.priceWaitingPerHour),
    priceNightSurchargePercent: toOptionalInt(form.priceNightSurchargePercent),
    priceExtraLoading: toOptionalInt(form.priceExtraLoading),
    ...(imageIds ? { imageIds } : {}),
  }
}
