import { mockTowTrucks } from './towTrucks'
import type { FreeRoute, FreeRouteDriver } from '~/types/freeRoute'

/**
 * ⚠️ Demo data — only used when no backend is configured (isApiEnabled() === false).
 * Departure times are computed relative to "now" so the demo always looks live.
 */

function driverFromTruck(towTruckId: number): FreeRouteDriver {
  const truck = mockTowTrucks.find((item) => item.id === towTruckId)
  if (!truck) throw new Error(`mocks/freeRoutes.ts: tow truck ${towTruckId} not found`)
  return {
    slug: truck.slug,
    name: truck.companyName || truck.driverName,
    phone: truck.phone,
    vehicleType: truck.vehicle.type,
  }
}

const inHours = (hours: number): string => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()

export const mockFreeRoutes: FreeRoute[] = [
  {
    id: 1,
    startRegionSlug: 'gegharkunik',
    startCitySlug: 'gavar',
    endRegionSlug: 'yerevan',
    endCitySlug: 'kentron',
    departureAt: inHours(3),
    description: 'Կարող եմ սպասել կես ժամ ճանապարհին։',
    driver: driverFromTruck(1),
  },
  {
    id: 2,
    startRegionSlug: 'lori',
    startCitySlug: 'vanadzor',
    endRegionSlug: 'yerevan',
    endCitySlug: 'ajapnyak',
    departureAt: inHours(6),
    driver: driverFromTruck(14),
  },
  {
    id: 3,
    startRegionSlug: 'yerevan',
    startCitySlug: 'erebuni',
    endRegionSlug: 'ararat',
    endCitySlug: 'artashat',
    departureAt: inHours(26),
    description: 'Ուղևորվում եմ Արտաշատի ուղղությամբ, կարող եմ շեղվել 10-15 կմ։',
    driver: driverFromTruck(4),
  },
]
