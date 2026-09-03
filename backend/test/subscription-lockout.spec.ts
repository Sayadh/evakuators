import 'reflect-metadata'
import { HttpException, HttpStatus } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { describe, expect, it, vi } from 'vitest'
import { MyFreeRoutesController } from '../src/free-routes/my-free-routes.controller'
import { MyTowTruckController } from '../src/my-tow-truck/my-tow-truck.controller'
import { SubscriptionActiveGuard } from '../src/subscriptions/subscription-active.guard'
import { isLockedOut } from '../src/subscriptions/subscription-status'
import type { SubscriptionsRepository } from '../src/subscriptions/subscriptions.repository'

/**
 * The paywall, in the two places that have to agree: the rule itself, and the
 * guard that enforces it on the routes a lapsed driver must not reach.
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

function guardWith(paidUntil: Date | null): SubscriptionActiveGuard {
  const repository = {
    findCoverage: vi.fn(async (ids: number[]) => {
      const map = new Map()
      for (const id of ids) map.set(id, { towTruckId: id, paidUntil, lastPaidAt: null, pendingCount: 0 })
      return map
    }),
  } as unknown as SubscriptionsRepository
  return new SubscriptionActiveGuard(repository)
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

  it('refuses rather than guesses when no driver id was set', async () => {
    // i.e. DriverJwtGuard did not run first. "No id" must not read as
    // "nothing to check".
    await expect(guardWith(inDays(20)).canActivate(contextFor(undefined))).rejects.toBeInstanceOf(
      HttpException,
    )
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
