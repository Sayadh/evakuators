import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SPECIALIST_VEHICLE_TYPES, isSpecialistVehicleType } from '~/constants/vehicles'
import { VEHICLE_TYPE_PAGE_LIST } from '~/constants/vehicleTypePages'
import { VehicleType } from '~/types/enums'

/**
 * «Մանիպուլյատոր» and «Ծանր տեխնիկա» are listed on their own landing pages and
 * nowhere else — not on a city, marz or Yerevan page, not in the homepage's
 * featured picks, not in the per-area counters, not in the nearest-driver
 * search.
 *
 * The rule is enforced in Postgres, so almost nothing here can be checked by
 * calling a function: what these tests protect is the *shape* of the rule and
 * the fact that four separate files still agree about it.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (path: string): string => readFileSync(`${ROOT}${path}`, 'utf8')

describe('isSpecialistVehicleType', () => {
  it('is true for exactly the two landing-page types', () => {
    expect(isSpecialistVehicleType(VehicleType.Manipulator)).toBe(true)
    expect(isSpecialistVehicleType(VehicleType.HeavyDuty)).toBe(true)
  })

  it('is false for the ordinary fleet', () => {
    expect(isSpecialistVehicleType(VehicleType.Flatbed)).toBe(false)
    expect(isSpecialistVehicleType(VehicleType.SlidingPlatform)).toBe(false)
  })

  it('is false for a type it has never heard of', () => {
    // An unknown slug must not be hidden. The taxonomy lives here, but a row
    // written by an older build could hold anything, and "hide what I do not
    // recognise" would quietly delete those drivers from every listing.
    expect(isSpecialistVehicleType('crane')).toBe(false)
    expect(isSpecialistVehicleType('')).toBe(false)
  })

  it('covers every type that has a landing page, and only those', () => {
    // The two lists answer the same question from opposite ends: one says
    // "these have a page", the other "these appear only on it". A landing page
    // whose type is missing here would show its trucks in both places; an entry
    // here with no page would hide a truck from the whole site.
    expect([...SPECIALIST_VEHICLE_TYPES].sort()).toEqual(
      VEHICLE_TYPE_PAGE_LIST.map((page) => page.vehicleType).sort(),
    )
  })
})

describe('the exclusion is by TYPE, not by the equipment flags', () => {
  /**
   * The distinction the whole feature rests on, and the easiest thing to get
   * wrong, because `hasManipulator` is right there and reads like the same
   * question.
   *
   * It is not. The unions ask "can this truck ALSO do the specialist job" —
   * which is why a flatbed with a crane belongs on `/manipulator`. Hiding asks
   * "is that job all the truck is FOR". Excluding on the union would take every
   * crane-equipped flatbed and every admin-flagged truck out of the city pages
   * they legitimately serve.
   */
  const source = read('constants/vehicles.ts')
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  it('does not consult hasManipulator', () => {
    const predicate = code.slice(code.indexOf('export function isSpecialistVehicleType'))
    expect(predicate).not.toContain('hasManipulator')
    expect(predicate).not.toContain('manipulator ||')
  })

  it('keeps hasManipulator itself a union', () => {
    // The landing pages still need it. Guards against "fixing" the ambiguity by
    // narrowing the wrong one of the two predicates.
    expect(code).toContain('vehicle.manipulator || vehicle.type === VehicleType.Manipulator')
  })
})

describe('the two copies of the rule', () => {
  /**
   * No shared code between the projects (CLAUDE.md), so the list exists twice:
   * the backend copy is the real boundary, this one is what mock mode filters
   * on. Read as text — the same technique `manipulator.spec.ts` and
   * `serviceAreaLimits.spec.ts` use.
   */
  const backend = read('../backend/src/tow-trucks/vehicle-types.ts')

  it('agrees on the members', () => {
    const declaration = backend.slice(
      backend.indexOf('export const SPECIALIST_VEHICLE_TYPES'),
      backend.indexOf('] as const'),
    )
    expect(declaration).toContain('MANIPULATOR_VEHICLE_TYPE')
    expect(declaration).toContain('HEAVY_DUTY_VEHICLE_TYPE')
    expect(SPECIALIST_VEHICLE_TYPES).toHaveLength(2)
  })

  it('agrees that the backend excludes by type alone', () => {
    // If the backend ever switched to `derivesManipulator`, the API and mock
    // mode would list different drivers on every city page — and mock mode is
    // where the design gets checked.
    const declaration = backend.slice(backend.indexOf('export const SPECIALIST_VEHICLE_TYPES'))
    expect(declaration).not.toContain('derivesManipulator')
    expect(declaration).not.toContain('derivesHeavyEquipment')
  })
})

describe('the backend applies it to every general read path', () => {
  /**
   * Each of these writes its own WHERE, so each is a place to forget the rule —
   * and forgetting it looks like nothing at all until a marz page lists a crane
   * truck. The backend has its own behavioural tests for the WHERE
   * (`backend/test/vehicle-type-filter.spec.ts`); this only checks that the
   * clause is still reached from here, since these two projects are built and
   * deployed separately and a frontend-only deploy can outrun a backend one.
   */
  const repository = read('../backend/src/tow-trucks/tow-trucks.repository.ts')

  it('shares one fragment rather than repeating the list', () => {
    expect(repository).toContain('const GENERAL_DISCOVERY_VEHICLE_TYPE')
    expect(repository).toContain('notIn: [...SPECIALIST_VEHICLE_TYPES]')
  })

  it('applies it to the listing, the counters, the featured picks and the card fetch', () => {
    // Four call sites plus the declaration.
    const uses = repository.split('GENERAL_DISCOVERY_VEHICLE_TYPE').length - 1
    expect(uses).toBeGreaterThanOrEqual(5)
  })

  it('filters the nearest search inside the PostGIS query, before LIMIT', () => {
    // Dropping specialist trucks after the KNN walk would silently return fewer
    // than N drivers to someone standing next to a broken car — the same
    // argument that put `isActive` in this query rather than after it.
    const nearest = read('../backend/src/nearest/nearest.repository.ts')
    expect(nearest).toContain('SPECIALIST_VEHICLE_TYPES')
    expect(nearest).toContain('NOT IN')
    expect(nearest.indexOf('NOT IN')).toBeLessThan(nearest.indexOf('LIMIT ${limit}'))
  })
})

describe('mock mode lists the same drivers the API would', () => {
  const service = read('services/towTrucks.service.ts')
  // Comments stripped: they name both arrays while explaining the rule, and a
  // count of identifier uses has to count uses.
  const code = service.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  it('filters the mock fleet once, at module scope', () => {
    expect(service).toContain('const generalMockTowTrucks = mockTowTrucks.filter(')
    expect(service).toContain('!isSpecialistVehicleType(truck.vehicle.type)')
  })

  it('reads the raw mock fleet only where naming a type lifts the rule', () => {
    // `getBySlug` (a profile is still a real page) and `getByVehicleType` (the
    // landing pages themselves). Anywhere else is a general listing that would
    // disagree with the API.
    const rawUses = code.split(/\bmockTowTrucks\b/).length - 1
    // one import, one `generalMockTowTrucks` definition, getBySlug, getByVehicleType
    expect(rawUses).toBe(4)
  })
})

describe('the sitemap still announces every specialist profile', () => {
  /**
   * The regression this exists for: `GET /tow-trucks` is general discovery and
   * no longer returns these trucks, so a sitemap that walked only it would
   * quietly deindex every manipulator and heavy-duty profile page — pages that
   * are real, linked from the landing pages, and worth exactly as much traffic
   * as before.
   */
  const sitemap = read('server/routes/sitemap.xml.ts')

  it('walks the landing-page listings as well as the general one', () => {
    expect(sitemap).toContain('walkListing(apiBase, {})')
    expect(sitemap).toContain('walkListing(apiBase, { vehicleType: page.vehicleType })')
  })

  it('drives those walks from the landing-page list, not a hardcoded pair', () => {
    // So a third landing page is announced automatically, the way its nav entry
    // and its own URL already are.
    expect(sitemap).toContain('VEHICLE_TYPE_PAGE_LIST.map((page) =>')
  })

  it('dedupes by slug, because the walks legitimately overlap', () => {
    // A landing page answers with a union, so a flatbed carrying a crane is in
    // both its listing and the general one. A repeated <url> is a malformed
    // sitemap, not a stronger signal.
    expect(sitemap).toContain('const bySlug = new Map<string, TowTruckSitemapEntry>()')
  })
})
