import { describe, expect, it } from 'vitest'
import {
  HEAVY_TRANSPORT_SERVICES,
  MANIPULATOR_SERVICES,
  SERVICE_CATEGORIES,
  SERVICE_LABELS,
  serviceCategoriesFor,
  servicesAllowedFor,
  STANDALONE_SERVICES,
  withService,
} from '~/constants/services'
import {
  hasUncappedCoverage,
  validateServiceAreaSelection,
} from '~/constants/serviceAreaLimits'
import {
  asksWheelSkates,
  capacityRangeFromTons,
  matchesCapacityRange,
  specialistSpecFieldsFor,
  usesExactCapacity,
} from '~/constants/vehicles'
import { ServiceType, VehicleType } from '~/types/enums'
import {
  createRegistrationFormState,
  syncVehicleDependentFields,
  validateSpecialistSpecs,
} from '~/utils/registrationForm'
import { buildServiceAreas } from '~/utils/serviceAreas'

/**
 * «Մանիպուլյատոր» and «Ծանր տեխնիկայի էվակուատոր» ask a different set of
 * questions from an ordinary evacuator, and are exempt from the coverage cap.
 *
 * What is worth testing here is not that the lists have the right length — it
 * is the handful of rules that, if they broke, would break silently:
 *
 * - a service ticked before the type changed staying on a profile with no
 *   checkbox to remove it;
 * - the cap being lifted for the wrong drivers, or not lifted at all;
 * - «Ամբողջ Հայաստան» and "all eleven marzes, ticked" becoming the same
 *   stored value;
 * - two questions being asked about one capacity, or neither.
 */

const manipulator = { vehicleType: VehicleType.Manipulator }
const heavyDuty = { vehicleType: VehicleType.HeavyDuty }
const flatbed = { vehicleType: VehicleType.Flatbed }

describe('serviceCategoriesFor', () => {
  it('gives an ordinary evacuator the full five categories', () => {
    expect(serviceCategoriesFor(VehicleType.Flatbed)).toBe(SERVICE_CATEGORIES)
    expect(serviceCategoriesFor(VehicleType.SlidingPlatform)).toBe(SERVICE_CATEGORIES)
  })

  it('replaces the evacuator list for the two specialist types', () => {
    for (const type of [VehicleType.Manipulator, VehicleType.HeavyDuty]) {
      const keys = serviceCategoriesFor(type).map((category) => category.key)
      expect(keys).not.toContain('core')
      expect(keys).not.toContain('roadside')
      expect(keys).not.toContain('recovery')
    }
  })

  it('still asks everyone about payment and working conditions', () => {
    for (const type of Object.values(VehicleType)) {
      const keys = serviceCategoriesFor(type).map((category) => category.key)
      expect(keys).toContain('payment')
      expect(keys).toContain('availability')
    }
  })

  it('does not hide roadside help from a flatbed that also carries a crane', () => {
    // The exemption is by TYPE, never by the capability flags — a flatbed with
    // a crane is an ordinary evacuator that really does answer roadside calls.
    expect(serviceCategoriesFor(VehicleType.Flatbed)).toBe(SERVICE_CATEGORIES)
  })

  it('labels every specialist service — no slug can reach a page unlabelled', () => {
    for (const slug of [...MANIPULATOR_SERVICES, ...HEAVY_TRANSPORT_SERVICES]) {
      expect(SERVICE_LABELS[slug], slug).toBeTruthy()
    }
  })

  it('reuses existing slugs rather than minting near-duplicates', () => {
    // Two slugs meaning one thing is what the taxonomy module exists to
    // prevent: the card, the filter and the profile would each pick one.
    expect(MANIPULATOR_SERVICES).toContain(ServiceType.AgriculturalEquipmentTransport)
    expect(HEAVY_TRANSPORT_SERVICES).toContain(ServiceType.AgriculturalEquipmentTransport)
    expect(MANIPULATOR_SERVICES).toContain(ServiceType.IntercityTransport)
    expect(MANIPULATOR_SERVICES).toContain(ServiceType.ConstructionEquipmentTransport)
  })
})

describe('payment methods', () => {
  const payment = SERVICE_CATEGORIES.find((category) => category.key === 'payment')!

  it('offers the four real ways to hand over money, and nothing else', () => {
    expect(payment.services).toEqual([
      ServiceType.CashPayment,
      ServiceType.CashlessTransfer,
      ServiceType.BankTransfer,
      ServiceType.CardPayment,
    ])
  })

  it('names each one by HOW, so two of them cannot read as the same answer', () => {
    // «Անկանխիկ փոխանցում» and «Բանկային փոխանցում» described one act from two
    // angles, and a driver could not tell which meant "to my card".
    expect(SERVICE_LABELS[ServiceType.CashlessTransfer]).toContain('քարտին')
    expect(SERVICE_LABELS[ServiceType.BankTransfer]).toContain('հաշվեհամարին')
    expect(SERVICE_LABELS[ServiceType.CardPayment]).toContain('POS')
  })

  it('does not carry the invoice — that is a document, not a method', () => {
    expect(payment.services).not.toContain(ServiceType.InvoiceProvided)
  })
})

describe('STANDALONE_SERVICES', () => {
  it('holds the invoice, which is asked outside every category', () => {
    expect(STANDALONE_SERVICES).toEqual([ServiceType.InvoiceProvided])
    const inACategory = SERVICE_CATEGORIES.flatMap((category) => category.services)
    expect(inACategory).not.toContain(ServiceType.InvoiceProvided)
  })

  it('survives a vehicle-type change, unlike an orphaned slug', () => {
    // The bug this guards: `servicesAllowedFor` deletes answers whose question
    // left the screen. A slug in no category looks exactly like one of those,
    // so without STANDALONE_SERVICES the invoice tick would vanish the first
    // time a driver touched their vehicle type — silently, on a field they
    // never changed.
    for (const type of Object.values(VehicleType)) {
      expect(servicesAllowedFor(type, [ServiceType.InvoiceProvided]), type).toEqual([
        ServiceType.InvoiceProvided,
      ])
    }
  })
})

describe('withService', () => {
  it('adds, removes, and never duplicates', () => {
    expect(withService([], ServiceType.InvoiceProvided, true)).toEqual([
      ServiceType.InvoiceProvided,
    ])
    expect(
      withService([ServiceType.InvoiceProvided], ServiceType.InvoiceProvided, true),
    ).toEqual([ServiceType.InvoiceProvided])
    expect(
      withService([ServiceType.CashPayment, ServiceType.InvoiceProvided], ServiceType.InvoiceProvided, false),
    ).toEqual([ServiceType.CashPayment])
  })

  it('returns a new array, so a checkbox bound to it re-renders', () => {
    const services = [ServiceType.CashPayment]
    expect(withService(services, ServiceType.InvoiceProvided, true)).not.toBe(services)
  })
})

describe('servicesAllowedFor', () => {
  it('drops answers whose question disappeared with the vehicle type', () => {
    const kept = servicesAllowedFor(VehicleType.Manipulator, [
      ServiceType.TireReplacement, // roadside — no longer asked
      ServiceType.MachineryTransport, // manipulator list
      ServiceType.CardPayment, // universal
    ])
    expect(kept).toEqual([ServiceType.MachineryTransport, ServiceType.CardPayment])
  })

  it('leaves an ordinary evacuator untouched', () => {
    const services = [ServiceType.TireReplacement, ServiceType.WinchRecovery]
    expect(servicesAllowedFor(VehicleType.Flatbed, services)).toEqual(services)
  })
})

describe('capacity: the band or the figure, never both', () => {
  it('asks a specialist for an exact tonnage', () => {
    expect(usesExactCapacity(VehicleType.Manipulator)).toBe(true)
    expect(usesExactCapacity(VehicleType.HeavyDuty)).toBe(true)
  })

  it('asks an ordinary evacuator for a band', () => {
    expect(usesExactCapacity(VehicleType.Flatbed)).toBe(false)
    expect(usesExactCapacity(VehicleType.SlidingPlatform)).toBe(false)
  })

  it('derives a band that the public capacity filter agrees with', () => {
    // The round trip that matters: a specialist's stated figure must land in
    // the band a customer filtering by capacity would find them under.
    for (const tons of [1, 3, 4, 8, 25]) {
      const band = capacityRangeFromTons(tons)
      expect(band, `no band for ${tons}t`).not.toBe('')
      expect(matchesCapacityRange(tons, band)).toBe(true)
    }
  })
})

describe('specialistSpecFieldsFor', () => {
  it('asks a manipulator about its crane, not about a loading height', () => {
    const keys = specialistSpecFieldsFor(VehicleType.Manipulator).map((field) => field.key)
    expect(keys).toContain('craneCapacityTons')
    expect(keys).toContain('craneReachM')
    expect(keys).not.toContain('platformLoadHeightCm')
  })

  it('asks a transporter about its deck, not about a crane', () => {
    const keys = specialistSpecFieldsFor(VehicleType.HeavyDuty).map((field) => field.key)
    expect(keys).toContain('platformLoadHeightCm')
    expect(keys).not.toContain('craneCapacityTons')
  })

  it('asks an ordinary evacuator nothing extra', () => {
    expect(specialistSpecFieldsFor(VehicleType.Flatbed)).toEqual([])
  })

  it('asks only the car-loading vehicles about wheel skates', () => {
    // Skates roll a locked-wheel car onto a platform. A crane lifts and a
    // transporter is loaded onto a low deck — neither ever uses one.
    expect(asksWheelSkates(VehicleType.Flatbed)).toBe(true)
    expect(asksWheelSkates(VehicleType.SlidingPlatform)).toBe(true)
    expect(asksWheelSkates(VehicleType.Manipulator)).toBe(false)
    expect(asksWheelSkates(VehicleType.HeavyDuty)).toBe(false)
  })

  it('keys the questions on the vehicle, never on the heavy-equipment flag', () => {
    // A manipulator that also moves machinery is still a manipulator: the
    // customer needs its crane rating, not a transporter's deck height.
    const form = createRegistrationFormState()
    form.vehicleType = VehicleType.Manipulator
    form.heavyEquipment = true
    const keys = specialistSpecFieldsFor(form.vehicleType).map((field) => field.key)
    expect(keys).toContain('craneCapacityTons')
    expect(keys).not.toContain('platformLoadHeightCm')
  })
})

describe('validateSpecialistSpecs', () => {
  it('requires the exact tonnage that replaces the band', () => {
    const errors: Record<string, string> = {}
    validateSpecialistSpecs(
      { ...createRegistrationFormState(), vehicleType: VehicleType.HeavyDuty },
      errors,
    )
    expect(errors.maxLoadTons).toBeTruthy()
  })

  it('leaves the optional figures blank without complaint', () => {
    const errors: Record<string, string> = {}
    validateSpecialistSpecs(
      {
        ...createRegistrationFormState(),
        vehicleType: VehicleType.Manipulator,
        maxLoadTons: '10',
      },
      errors,
    )
    expect(errors.maxLoadTons).toBe('')
    expect(errors.craneReachM).toBe('')
  })

  it('accepts a comma decimal, which is what an Armenian keyboard produces', () => {
    const errors: Record<string, string> = {}
    validateSpecialistSpecs(
      {
        ...createRegistrationFormState(),
        vehicleType: VehicleType.Manipulator,
        maxLoadTons: '5,5',
      },
      errors,
    )
    expect(errors.maxLoadTons).toBe('')
  })

  it('rejects a figure outside the field range', () => {
    const errors: Record<string, string> = {}
    validateSpecialistSpecs(
      {
        ...createRegistrationFormState(),
        vehicleType: VehicleType.Manipulator,
        maxLoadTons: '9999',
      },
      errors,
    )
    expect(errors.maxLoadTons).toBeTruthy()
  })

  it('stops reporting a field the driver can no longer see', () => {
    // The bug this guards: switch to a manipulator, leave the required tonnage
    // blank, switch back to a flatbed — and the form is unsubmittable with an
    // error under an input that is no longer rendered.
    const errors: Record<string, string> = {}
    const form = createRegistrationFormState()
    form.vehicleType = VehicleType.HeavyDuty
    validateSpecialistSpecs(form, errors)
    expect(errors.maxLoadTons).toBeTruthy()

    form.vehicleType = VehicleType.Flatbed
    validateSpecialistSpecs(form, errors)
    expect(errors.maxLoadTons).toBe('')
  })
})

describe('hasUncappedCoverage', () => {
  it('exempts the two specialist types', () => {
    expect(hasUncappedCoverage(manipulator)).toBe(true)
    expect(hasUncappedCoverage(heavyDuty)).toBe(true)
  })

  it('exempts a flatbed that carries a crane or moves machinery', () => {
    expect(hasUncappedCoverage({ ...flatbed, manipulator: true })).toBe(true)
    expect(hasUncappedCoverage({ ...flatbed, heavyEquipment: true })).toBe(true)
  })

  it('does not exempt an ordinary evacuator', () => {
    expect(hasUncappedCoverage(flatbed)).toBe(false)
    expect(hasUncappedCoverage({ vehicleType: VehicleType.SlidingPlatform })).toBe(false)
  })
})

describe('validateServiceAreaSelection with a vehicle', () => {
  it('still caps an ordinary evacuator', () => {
    expect(
      validateServiceAreaSelection(['lori'], ['vanadzor', 'spitak', 'stepanavan', 'alaverdi'], flatbed),
    ).not.toBe('')
  })

  it('accepts a wide marz list from a crane truck', () => {
    expect(validateServiceAreaSelection(['lori', 'syunik', 'tavush'], [], manipulator)).toBe('')
  })

  it('accepts an empty selection once «Ամբողջ Հայաստան» is the answer', () => {
    expect(
      validateServiceAreaSelection([], [], { ...manipulator, servesAllArmenia: true }),
    ).toBe('')
  })

  it('still wants at least one marz from an uncapped driver who did not say "everywhere"', () => {
    expect(validateServiceAreaSelection([], [], manipulator)).not.toBe('')
  })

  it('caps when the caller does not say which vehicle — the safe direction', () => {
    // Omitting the vehicle can only refuse something the API would accept,
    // never accept something it will reject.
    expect(validateServiceAreaSelection(['lori'], ['a', 'b', 'c', 'd'])).not.toBe('')
  })
})

describe('buildServiceAreas', () => {
  it('writes cities for an ordinary evacuator', () => {
    const areas = buildServiceAreas({
      ...flatbed,
      regionSlugs: ['lori'],
      citySlugs: ['vanadzor'],
      baseSlug: 'vanadzor',
    })
    expect(areas).toHaveLength(1)
    expect(areas[0]?.slug).toBe('vanadzor')
    expect(areas[0]?.type).toBe('city')
  })

  it('writes marzes for an uncapped driver who picked marzes', () => {
    const areas = buildServiceAreas({
      ...manipulator,
      regionSlugs: ['lori', 'syunik'],
      citySlugs: [],
    })
    expect(areas.map((area) => area.type)).toEqual(['region', 'region'])
    expect(areas.map((area) => area.slug)).toEqual(['lori', 'syunik'])
  })

  it('resolves an Armenian name for every entry — the backend cannot', () => {
    // Sending `name: slug` is what once put raw English slugs on public
    // profiles; the backend stores exactly what it is given.
    const areas = buildServiceAreas({
      ...manipulator,
      regionSlugs: ['lori'],
      citySlugs: [],
    })
    expect(areas[0]?.name).not.toBe('lori')
    expect(areas[0]?.name).toBeTruthy()
  })

  it('writes NO region rows for «Ամբողջ Հայաստան»', () => {
    // "Everywhere" and "all eleven, ticked one by one" must stay
    // distinguishable, or the form can never show a driver back their own
    // choice and adding a marz silently shrinks the first group's coverage.
    const areas = buildServiceAreas({
      ...manipulator,
      servesAllArmenia: true,
      regionSlugs: ['lori', 'syunik'],
      citySlugs: [],
      baseSlug: 'vanadzor',
    })
    expect(areas.map((area) => area.slug)).toEqual(['vanadzor'])
  })

  it('always includes the base, so the placement rule holds without being relaxed', () => {
    const areas = buildServiceAreas({
      ...manipulator,
      regionSlugs: ['lori'],
      citySlugs: [],
      baseSlug: 'vanadzor',
    })
    expect(areas.some((area) => area.slug === 'vanadzor')).toBe(true)
  })

  it('does not duplicate a base that is already covered', () => {
    const areas = buildServiceAreas({
      ...flatbed,
      regionSlugs: ['lori'],
      citySlugs: ['vanadzor', 'spitak'],
      baseSlug: 'vanadzor',
    })
    expect(areas.filter((area) => area.slug === 'vanadzor')).toHaveLength(1)
  })
})

describe('syncVehicleDependentFields', () => {
  it('ticks the manipulator checkbox for the manipulator type', () => {
    const form = createRegistrationFormState()
    form.vehicleType = VehicleType.Manipulator
    syncVehicleDependentFields(form)
    expect(form.manipulator).toBe(true)
  })

  it('ticks «Ծանր տեխնիկայի տեղափոխում» for the heavy-duty type', () => {
    const form = createRegistrationFormState()
    form.vehicleType = VehicleType.HeavyDuty
    syncVehicleDependentFields(form)
    expect(form.heavyEquipment).toBe(true)
  })

  it('never unticks on the way back — that `true` may be the driver’s own answer', () => {
    const form = createRegistrationFormState()
    form.vehicleType = VehicleType.Manipulator
    syncVehicleDependentFields(form)
    form.vehicleType = VehicleType.Flatbed
    syncVehicleDependentFields(form)
    expect(form.manipulator).toBe(true)
  })

  it('takes nationwide coverage away from a driver who stops qualifying', () => {
    // An invisible `true` would publish coverage with no control to remove it,
    // and the API would then reject the save over a field they cannot see.
    const form = createRegistrationFormState()
    form.vehicleType = VehicleType.HeavyDuty
    form.servesAllArmenia = true
    syncVehicleDependentFields(form)
    expect(form.servesAllArmenia).toBe(true)

    form.vehicleType = VehicleType.Flatbed
    form.heavyEquipment = false
    form.manipulator = false
    syncVehicleDependentFields(form)
    expect(form.servesAllArmenia).toBe(false)
  })

  it('clears whichever capacity answer is not being asked', () => {
    const form = createRegistrationFormState()
    form.capacity = '5-10'
    form.vehicleType = VehicleType.Manipulator
    syncVehicleDependentFields(form)
    expect(form.capacity).toBe('')

    form.maxLoadTons = '25'
    form.vehicleType = VehicleType.Flatbed
    form.manipulator = false
    syncVehicleDependentFields(form)
    expect(form.maxLoadTons).toBe('')
  })

  it('clears wheel skates for a vehicle that is never asked about them', () => {
    // Same class of bug as the services: an answer with no question left is
    // invisible on the form and still rendered on the public profile.
    const form = createRegistrationFormState()
    form.wheelSkates = true
    form.vehicleType = VehicleType.Manipulator
    syncVehicleDependentFields(form)
    expect(form.wheelSkates).toBe(false)
  })

  it('leaves wheel skates alone for an ordinary evacuator', () => {
    const form = createRegistrationFormState()
    form.wheelSkates = true
    form.vehicleType = VehicleType.SlidingPlatform
    syncVehicleDependentFields(form)
    expect(form.wheelSkates).toBe(true)
  })

  it('removes services whose category the new vehicle is not shown', () => {
    const form = createRegistrationFormState()
    form.services = [ServiceType.TireReplacement, ServiceType.CardPayment]
    form.vehicleType = VehicleType.Manipulator
    syncVehicleDependentFields(form)
    expect(form.services).toEqual([ServiceType.CardPayment])
  })
})
