import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { RequestMethod } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { AdminJwtGuard } from '../src/admin-auth/admin-jwt.guard'
import { AdminController } from '../src/admin/admin.controller'

/**
 * Routing invariants for the admin controller, read straight off the decorator
 * metadata Nest itself reads.
 *
 * ## Why metadata and not an HTTP request
 *
 * Booting the app would need Postgres, Supabase credentials and a Telegram
 * token — three external systems, to answer questions that are fully decided
 * at class-definition time. What an end-to-end request WOULD additionally
 * prove (that the guard rejects a bad token) belongs with the guard's own
 * tests, not here.
 *
 * ## What is actually at risk
 *
 * `tow-trucks/count` is a literal segment living in the same namespace as
 * `tow-trucks/:id/...`. Nest matches routes in declaration order, so a
 * `@Get('tow-trucks/:id')` added ABOVE it would swallow `/count` and hand the
 * string `"count"` to a `ParseIntPipe`, turning the admin header into a 400.
 * Nothing in the type system prevents that; this test does.
 */

type Handler = (...args: never[]) => unknown

/**
 * Would a request that matches `literal` also be caught by `earlier`?
 *
 * Express (and therefore Nest) matches segment by segment in declaration
 * order, so a route shadows a later one when it has the same number of
 * segments and every one of its segments either matches literally or is a
 * `:param`. `registration-requests/:id/approve` cannot shadow
 * `tow-trucks/count` — different first segment, different length — which is
 * why this compares route SHAPES rather than just asking "is there a colon".
 */
function shadows(earlier: string, literal: string): boolean {
  const a = earlier.split('/')
  const b = literal.split('/')
  return a.length === b.length && a.every((segment, i) => segment.startsWith(':') || segment === b[i])
}

function handlers(): { name: string; path: string; method: number }[] {
  return Object.getOwnPropertyNames(AdminController.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => {
      const handler = (AdminController.prototype as unknown as Record<string, Handler>)[name]!
      return {
        name,
        path: Reflect.getMetadata(PATH_METADATA, handler) as string,
        method: Reflect.getMetadata(METHOD_METADATA, handler) as number,
      }
    })
    .filter((route) => route.path !== undefined)
}

describe('AdminController route table', () => {
  it('mounts the count under /admin as a GET', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminController)).toBe('admin')

    const count = handlers().find((route) => route.name === 'countTowTrucks')
    expect(count).toBeDefined()
    expect(count!.path).toBe('tow-trucks/count')
    expect(count!.method).toBe(RequestMethod.GET)
  })

  /**
   * The exact string the frontend's `adminRepository.getTowTruckCounts()`
   * fetches. There is no shared package between the two projects (see
   * CLAUDE.md § "Manual sync points"), so this path is duplicated by hand and
   * nothing but a test can notice it drifting.
   */
  it('serves the path the frontend asks for', () => {
    const paths = handlers().map((route) => `/admin/${route.path}`)
    expect(paths).toContain('/admin/tow-trucks/count')
  })

  /**
   * The whole point of declaring it where it is declared — written as the
   * general rule, not as an assertion about today's route list, so it still
   * holds the day someone adds `GET /admin/tow-trucks/:id`.
   */
  it('is not shadowed by any earlier parameterised route', () => {
    const routes = handlers()
    for (const [index, route] of routes.entries()) {
      if (route.path.includes(':')) continue
      const shadowedBy = routes
        .slice(0, index)
        .filter((other) => other.method === route.method && shadows(other.path, route.path))
      expect(
        shadowedBy,
        `${route.name} ("${route.path}") is unreachable — declared after ${shadowedBy
          .map((other) => `"${other.path}"`)
          .join(', ')}`,
      ).toEqual([])
    }
  })

  /**
   * Every admin route is privileged: the count reveals how many drivers the
   * platform has, which is commercially sensitive and is NOT public anywhere
   * else. The guard is on the class, so this holds for the new route by
   * construction — asserted so that removing it to "debug something quickly"
   * cannot survive a test run.
   */
  it('keeps the whole controller behind the admin JWT guard', () => {
    const guards = (Reflect.getMetadata(GUARDS_METADATA, AdminController) ?? []) as unknown[]
    expect(guards).toContain(AdminJwtGuard)
  })

  /**
   * A guard that has never been seen to fire is not a guard. There is no
   * `GET /admin/tow-trucks/:id` today, so the check above passes trivially —
   * this pins the detector itself against the exact regression it exists for,
   * and against the near-misses it must NOT flag.
   */
  it('detects the shadowing it is meant to catch, and only that', () => {
    expect(shadows('tow-trucks/:id', 'tow-trucks/count')).toBe(true)
    // Different length — a 3-segment route cannot swallow a 2-segment one
    expect(shadows('tow-trucks/:id/active', 'tow-trucks/count')).toBe(false)
    // Different namespace
    expect(shadows('registration-requests/:id/approve', 'tow-trucks/count')).toBe(false)
    // Same shape, different literal
    expect(shadows('reviews/:id', 'tow-trucks/count')).toBe(false)
  })

  /** No two handlers may claim the same method + path */
  it('has no duplicate routes', () => {
    const keys = handlers().map((route) => `${route.method} ${route.path}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
