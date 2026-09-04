import 'reflect-metadata'
import { HttpException, HttpStatus } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import { MyFreeRoutesController } from '../src/free-routes/my-free-routes.controller'
import type { IdramService } from '../src/idram/idram.service'
import { MyTowTruckController } from '../src/my-tow-truck/my-tow-truck.controller'
import { SubscriptionActiveGuard } from '../src/subscriptions/subscription-active.guard'
import { isLockedOut } from '../src/subscriptions/subscription-status'
import type { SubscriptionsRepository } from '../src/subscriptions/subscriptions.repository'
import { SubscriptionsService } from '../src/subscriptions/subscriptions.service'
import type { TowTrucksRepository } from '../src/tow-trucks/tow-trucks.repository'

/**
 * The paywall, in the three places that have to agree: the rule itself, the
 * guard that enforces it on the routes a lapsed driver must not reach, and the
 * status the dashboard draws its own gate from.
 *
 * All three are additionally switched off wholesale while the deployment has
 * no payment gateway — the property that lets this ship to production before
 * Idram credentials exist without ejecting a single driver.
 */

describe('isLockedOut', () => {
  it('locks a driver whose coverage ran out', () => {
    expect(isLockedOut('overdue')).toBe(true)
  })

  it('does NOT lock a driver who has never been billed', () => {
    // The deploy-day property: every driver an admin never marked paid — which
    // is most of them — must keep working. Losing this is losing the platform.
    expect(isLockedOut('unpaid')).toBe(false)
  })

  it('does not lock while the warning window is running', () => {
    expect(isLockedOut('due-soon')).toBe(false)
    expect(isLockedOut('paid')).toBe(false)
  })
})

/** A ConfigService that answers `idram` with credentials, or with blanks (= gateway off) */
function configWith(configured: boolean): ConfigService {
  return {
    getOrThrow: () =>
      configured ? { recAccount: '11112222', secretKey: 'secret' } : { recAccount: '', secretKey: '' },
  } as unknown as ConfigService
}

function guardWith(paidUntil: Date | null, gateway = true): SubscriptionActiveGuard {
  const repository = {
    findCoverage: vi.fn(async (ids: number[]) => {
      const map = new Map()
      for (const id of ids) map.set(id, { towTruckId: id, paidUntil, lastPaidAt: null, pendingCount: 0 })
      return map
    }),
  } as unknown as SubscriptionsRepository
  return new SubscriptionActiveGuard(configWith(gateway), repository)
}

function contextFor(towTruckId: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ towTruckId }) }),
  } as unknown as ExecutionContext
}

const inDays = (days: number): Date => new Date(Date.now() + days * 24 * 60 * 60 * 1000)

describe('SubscriptionActiveGuard', () => {
  it('lets a covered driver through', async () => {
    await expect(guardWith(inDays(20)).canActivate(contextFor(7))).resolves.toBe(true)
  })

  it('lets a driver who has never paid through', async () => {
    await expect(guardWith(null).canActivate(contextFor(7))).resolves.toBe(true)
  })

  it('lets a driver in the warning window through — they have not lapsed yet', async () => {
    await expect(guardWith(inDays(2)).canActivate(contextFor(7))).resolves.toBe(true)
  })

  it('refuses a lapsed driver with 402, not 401', async () => {
    // 401 on a /my/* path is what apiFetch reads as an expired session, and it
    // would sign out a driver whose session is fine and whose problem is a bill.
    const attempt = guardWith(inDays(-1)).canActivate(contextFor(7))
    await expect(attempt).rejects.toBeInstanceOf(HttpException)
    await expect(attempt).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED })
  })

  it('refuses nothing at all while there is no payment gateway', async () => {
    // The deploy-day property, second half: shipping this before Idram
    // credentials exist must not eject the drivers the backfill turns
    // `overdue`. There is no way for them to pay, so there is nothing to
    // refuse — and getMyStatus reports `locked: false` to match.
    await expect(guardWith(inDays(-1), false).canActivate(contextFor(7))).resolves.toBe(true)
  })

  it('still refuses a lapsed driver once the gateway is configured', async () => {
    await expect(guardWith(inDays(-1), true).canActivate(contextFor(7))).rejects.toBeInstanceOf(
      HttpException,
    )
  })

  it('refuses rather than guesses when no driver id was set', async () => {
    // i.e. DriverJwtGuard did not run first. "No id" must not read as
    // "nothing to check".
    await expect(guardWith(inDays(20)).canActivate(contextFor(undefined))).rejects.toBeInstanceOf(
      HttpException,
    )
  })
})

/**
 * The dashboard's half of the same decision. It must never lock someone the
 * guard would let through, or the driver sees a paywall the API does not
 * enforce — and, worse, the reverse.
 */
function statusServiceWith(paidUntil: Date | null, gateway: boolean, isActive = true): SubscriptionsService {
  const repository = {
    findCoverage: async (ids: number[]) => {
      const map = new Map()
      for (const id of ids) map.set(id, { towTruckId: id, paidUntil, lastPaidAt: null, pendingCount: 0 })
      return map
    },
  } as unknown as SubscriptionsRepository
  const trucks = {
    findStatusById: async () => ({ isActive, deactivationReason: isActive ? null : 'UNPAID' }),
  } as unknown as TowTrucksRepository
  const idram = { isConfigured: gateway } as unknown as IdramService
  return new SubscriptionsService(repository, trucks, idram)
}

describe('getMyStatus', () => {
  it('reports the gateway as off, and locks nobody, without credentials', async () => {
    const status = await statusServiceWith(inDays(-30), false).getMyStatus(7)
    expect(status.paymentsEnabled).toBe(false)
    // The status itself is still the truth — only the consequence is withheld.
    expect(status.status).toBe('overdue')
    expect(status.locked).toBe(false)
  })

  it('locks the same driver once credentials are set', async () => {
    const status = await statusServiceWith(inDays(-30), true).getMyStatus(7)
    expect(status.paymentsEnabled).toBe(true)
    expect(status.locked).toBe(true)
  })

  it('agrees with the guard on a covered driver either way', async () => {
    for (const gateway of [true, false]) {
      const status = await statusServiceWith(inDays(20), gateway).getMyStatus(7)
      expect(status.locked).toBe(false)
      await expect(guardWith(inDays(20), gateway).canActivate(contextFor(7))).resolves.toBe(true)
    }
  })

  it('keeps a deactivated driver locked even with no gateway', async () => {
    // Not a billing state: an admin took the page off the site, and that is
    // true whether or not there is anywhere to pay.
    const status = await statusServiceWith(inDays(30), false, false).getMyStatus(7)
    expect(status.paymentsEnabled).toBe(false)
    expect(status.locked).toBe(true)
  })
})

/** Which handlers carry the guard, read off the same metadata Nest reads */
function guardsOn(controller: object, method: string): unknown[] {
  const handler = (controller as unknown as Record<string, unknown>)[method]
  return (Reflect.getMetadata(GUARDS_METADATA, handler as object) as unknown[]) ?? []
}

describe('routes the paywall is attached to', () => {
  it('guards the writes that cost us something', () => {
    expect(guardsOn(MyTowTruckController.prototype, 'updateMine')).toContain(SubscriptionActiveGuard)
    expect(guardsOn(MyTowTruckController.prototype, 'updateCoordinates')).toContain(
      SubscriptionActiveGuard,
    )
    for (const method of ['create', 'update', 'remove']) {
      expect(guardsOn(MyFreeRoutesController.prototype, method)).toContain(SubscriptionActiveGuard)
    }
  })

  it('leaves the ways OUT of the lock open', () => {
    // A paywall that also blocks paying is a wall. Reading the profile, the
    // password change and the free-route list all stay reachable.
    expect(guardsOn(MyTowTruckController.prototype, 'getMine')).not.toContain(SubscriptionActiveGuard)
    expect(guardsOn(MyTowTruckController.prototype, 'changePassword')).not.toContain(
      SubscriptionActiveGuard,
    )
    expect(guardsOn(MyFreeRoutesController.prototype, 'listMine')).not.toContain(
      SubscriptionActiveGuard,
    )
  })
})
