import 'reflect-metadata'
import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { AdminService } from '../src/admin/admin.service'
import type { ApproveRegistrationDto } from '../src/admin/dto/approve-registration.dto'

/**
 * Approval publishes **what the moderator submitted**, not what the driver
 * originally typed.
 *
 * The review page at `/admin/registrations/:id` renders the whole registration
 * form pre-filled from the request and lets an admin correct it before pressing
 * Approve. That is only true if `approve()` builds the TowTruck out of the DTO;
 * the moment any column is read back off the stored `RegistrationRequest`
 * instead, a correction made on screen is silently discarded and the original
 * goes live with nothing on the page to explain it.
 *
 * These tests therefore hand `approve()` a stored request and a DTO that
 * DISAGREE on every editable field, and assert the created row matches the DTO.
 * A stored value appearing anywhere in `towTruck.create` is the bug.
 */

/** What the driver originally sent — every value here should end up unused */
const STORED = {
  id: 42,
  status: 'PENDING',
  firstName: 'Աշոտ',
  lastName: 'Սխալգրված',
  companyName: 'Հին ՍՊԸ',
  phone: '+37491000001',
  secondaryPhone: '+37499000001',
  whatsapp: '+37491000001',
  telegram: '@old',
  email: 'old@example.com',
  vehicleBrand: 'Isuzu',
  vehicleModel: 'NPR 75',
  vehicleYear: 2015,
  vehicleType: 'flatbed',
  capacityRange: 'up-to-3',
  platformLengthM: 4,
  platformWidthM: 2,
  winch: false,
  manipulator: false,
  wheelSkates: false,
  workingHoursText: '09:00 – 18:00',
  regionSlugs: ['kotayk', 'ararat'],
  citySlugs: ['abovyan', 'artashat'],
  services: ['towing'],
  latitude: null,
  longitude: null,
  priceCityCallout: 1000,
  pricePerKm: 100,
  priceWaitingPerHour: 1000,
  priceNightSurchargePercent: 10,
  priceExtraLoading: 1000,
  images: [],
}

/** What the moderator corrected it to — every value here should be stored */
function approveDto(overrides: Partial<ApproveRegistrationDto> = {}): ApproveRegistrationDto {
  return {
    slug: 'ashot-tow-service',
    capacityTons: 5,
    locationName: 'Աբովյան',
    citySlug: 'abovyan',
    regionSlug: 'kotayk',
    description: 'Ուղղված նկարագրություն',
    serviceAreas: [{ slug: 'abovyan', name: 'Աբովյան', type: 'city' }],

    firstName: 'Աշոտ',
    lastName: 'Ուղղված',
    companyName: 'Նոր ՍՊԸ',
    phone: '+37491000002',
    secondaryPhone: '+37499000002',
    whatsapp: undefined,
    telegram: '@new',
    email: 'new@example.com',
    vehicleBrand: 'Hino',
    vehicleModel: '300',
    vehicleYear: 2020,
    vehicleType: 'flatbed',
    capacityRange: 'up-to-5',
    platformLengthM: 6,
    platformWidthM: 2.5,
    winch: true,
    manipulator: true,
    wheelSkates: true,
    workingHoursText: '08:00 – 22:00',
    regionSlugs: ['kotayk'],
    citySlugs: ['abovyan'],
    services: ['towing', 'motorcycle-towing'],
    priceCityCallout: 2000,
    pricePerKm: 200,
    priceWaitingPerHour: 2000,
    priceNightSurchargePercent: 20,
    priceExtraLoading: 2000,
    ...overrides,
  } as ApproveRegistrationDto
}

function buildService(storedOverrides: Partial<typeof STORED> = {}) {
  const create = vi.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 7, ...args.data }),
  )

  const tx = {
    towTruck: { create },
    towTruckImage: { updateMany: vi.fn(() => Promise.resolve({ count: 0 })) },
    registrationRequest: { update: vi.fn(() => Promise.resolve({})) },
  }

  const prisma = {
    registrationRequest: {
      findUnique: vi.fn(() => Promise.resolve({ ...STORED, ...storedOverrides })),
    },
    $transaction: vi.fn((run: (t: typeof tx) => Promise<unknown>) => run(tx)),
  }

  const towTrucksRepository = {
    findByMainPhoneAnyStatus: vi.fn(() => Promise.resolve(null)),
    findBySlugAnyStatus: vi.fn(() => Promise.resolve(null)),
    setTelegramLinkToken: vi.fn(() => Promise.resolve({})),
  }

  const telegram = { buildLinkUrl: vi.fn(() => 'https://t.me/bot?start=token') }

  const service = new AdminService(
    prisma as never,
    {} as never,
    towTrucksRepository as never,
    telegram as never,
    {} as never,
    {} as never,
  )

  return { service, create, towTrucksRepository, tx }
}

/** The single `towTruck.create({ data })` payload an approval produced */
async function createdData(
  dtoOverrides: Partial<ApproveRegistrationDto> = {},
  storedOverrides: Partial<typeof STORED> = {},
): Promise<Record<string, unknown>> {
  const { service, create } = buildService(storedOverrides)
  await service.approve(42, approveDto(dtoOverrides))
  return create.mock.calls[0]![0].data
}

describe('approve() publishes the submitted profile', () => {
  it('stores the corrected name, company and contacts', async () => {
    const data = await createdData()

    expect(data.driverName).toBe('Աշոտ Ուղղված')
    expect(data.companyName).toBe('Նոր ՍՊԸ')
    expect(data.phone).toBe('+37491000002')
    expect(data.secondaryPhone).toBe('+37499000002')
    expect(data.telegram).toBe('@new')
    expect(data.email).toBe('new@example.com')
  })

  it('stores the corrected vehicle', async () => {
    const data = await createdData()

    expect(data.vehicleBrand).toBe('Hino')
    expect(data.vehicleModel).toBe('300')
    expect(data.vehicleYear).toBe(2020)
    expect(data.platformLengthM).toBe(6)
    expect(data.platformWidthM).toBe(2.5)
    expect(data.winch).toBe(true)
    expect(data.wheelSkates).toBe(true)
  })

  it('stores the corrected services, prices and working hours', async () => {
    const data = await createdData()

    expect(data.services).toEqual(['towing', 'motorcycle-towing'])
    expect(data.workingHoursText).toBe('08:00 – 22:00')
    expect(data.priceCityCallout).toBe(2000)
    expect(data.pricePerKm).toBe(200)
    expect(data.priceWaitingPerHour).toBe(2000)
    expect(data.priceNightSurchargePercent).toBe(20)
    expect(data.priceExtraLoading).toBe(2000)
  })

  it('clears WhatsApp when the moderator emptied the field', async () => {
    // Null, never a fallback to the main phone: a defaulted WhatsApp number
    // shows a button on every card that sends customers to a chat nobody reads,
    // and fires a "someone opened your WhatsApp" notice at a driver who has
    // none. An empty field is the answer, not an absence of one.
    const data = await createdData()
    expect(data.whatsapp).toBeNull()
  })

  it('derives works24Hours from the SUBMITTED services', async () => {
    // Never stored as its own column anywhere, so un-ticking «24/7» on the
    // review page has to be enough to clear it — and ticking it, to set it.
    expect((await createdData()).works24Hours).toBe(false)
    expect(
      (await createdData({ services: ['towing', 'available-24-7'] })).works24Hours,
    ).toBe(true)
  })

  it('derives manipulator from the SUBMITTED vehicle type and checkbox', async () => {
    // The stored request says false/false. Reading it would leave a truck the
    // moderator just marked as a manipulator invisible to the «Մանիպուլյատոր»
    // filter — which is precisely the customer looking for them.
    expect((await createdData()).manipulator).toBe(true)

    // And the type alone is enough, with the checkbox off.
    expect(
      (await createdData({ vehicleType: 'manipulator', manipulator: false })).manipulator,
    ).toBe(true)
  })

  it('never lets a driver self-promote onto /tsanr-tehnika', async () => {
    // heavyEquipment stores only an admin's own later decision. Deriving it
    // here would survive the driver changing their vehicle type away from
    // heavy-duty on the dashboard — see vehicle-types.ts.
    const data = await createdData({ vehicleType: 'heavy-duty' })
    expect(data.heavyEquipment).toBe(false)
  })

  it('checks phone uniqueness against the corrected number', async () => {
    // Checking the stored one would reject a number the admin just fixed, or
    // admit a duplicate they just introduced.
    const { service, towTrucksRepository } = buildService()
    await service.approve(42, approveDto())

    expect(towTrucksRepository.findByMainPhoneAnyStatus).toHaveBeenCalledWith('+37491000002')
  })

  it('applies the coverage cap to the SUBMITTED regions', async () => {
    // Narrowed to one marz on the page, so the one-marz budget (3) applies —
    // reading the stored two-marz list would hand out the looser bound (5) for
    // a selection that no longer exists.
    const fourAreas = [
      { slug: 'abovyan', name: 'Աբովյան', type: 'city' as const },
      { slug: 'hrazdan', name: 'Հրազդան', type: 'city' as const },
      { slug: 'charentsavan', name: 'Չարենցավան', type: 'city' as const },
      { slug: 'nor-hachn', name: 'Նոր Հաճն', type: 'city' as const },
    ]

    await expect(
      buildService().service.approve(
        42,
        approveDto({ regionSlugs: ['kotayk'], serviceAreas: fourAreas }),
      ),
    ).rejects.toThrow(BadRequestException)
  })

  it('leaves the stored request untouched apart from its status', async () => {
    // The row is the audit trail — the only surviving evidence of what the
    // driver actually sent. Approval marks it APPROVED and writes nothing else.
    const { service, tx } = buildService()
    await service.approve(42, approveDto())

    expect(tx.registrationRequest.update.mock.calls[0]![0]).toEqual({
      where: { id: 42 },
      data: { status: 'APPROVED' },
    })
  })

  it('still takes the photos from the request, which the page cannot edit', async () => {
    const { service, tx } = buildService()
    await service.approve(42, approveDto())

    expect(tx.towTruckImage.updateMany).toHaveBeenCalledWith({
      where: { registrationRequestId: 42 },
      data: { towTruckId: 7 },
    })
  })
})
