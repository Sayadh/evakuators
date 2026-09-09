import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { AdminJwtGuard } from '../src/admin-auth/admin-jwt.guard'
import { DispatchController } from '../src/dispatch/dispatch.controller'

/**
 * The dispatch feature is admin-only, and this is where that is enforced.
 *
 * ## Why this test exists rather than trusting the decorator
 *
 * Because of what the endpoint returns. `GET admin/dispatch/candidates` hands
 * back, for one place, every active driver's NAME and PHONE NUMBER together
 * with how much work each has been given and how long each has waited. That is
 * a ready-made lead list of the entire fleet plus the operator's own dispatch
 * pattern — the two things a competitor would most like to have. A public
 * variant of this route is not a smaller feature, it is a data export.
 *
 * The `@UseGuards` line is one line, and one line is exactly what gets lost:
 * moved to method level during a refactor and forgotten on the next method
 * added, or dropped while extracting a base class. Nothing in the type system
 * notices, no test that mocks the service notices, and the failure is silent —
 * the routes keep working, for everyone.
 *
 * ## Class level, not per method
 *
 * Asserted as class-level metadata on purpose. Per-method guards are the shape
 * that rots: `recordReferral` gains a sibling next month, whoever adds it
 * copies the method above it, and if that one happened to be the un-annotated
 * one the new route ships open. Class level cannot be forgotten by omission —
 * the only way to lose it is to delete it, which this test catches.
 *
 * ## Metadata, not an HTTP request
 *
 * Same reasoning as `admin.controller.count-route.spec.ts`: booting the app
 * needs Postgres, Supabase and Telegram to answer a question that is fully
 * decided at class-definition time. That `AdminJwtGuard` rejects a bad token
 * is the guard's own test's job, not this one's.
 */

function classGuards(): unknown[] {
  return (Reflect.getMetadata(GUARDS_METADATA, DispatchController) as unknown[]) ?? []
}

function methodGuards(name: string): unknown[] {
  const handler = (DispatchController.prototype as Record<string, unknown>)[name]
  return (Reflect.getMetadata(GUARDS_METADATA, handler as object) as unknown[]) ?? []
}

function handlerNames(): string[] {
  return Object.getOwnPropertyNames(DispatchController.prototype).filter(
    (name) => name !== 'constructor',
  )
}

describe('dispatch controller access', () => {
  it('guards the whole controller with AdminJwtGuard', () => {
    expect(classGuards()).toContain(AdminJwtGuard)
  })

  it('lives under admin/, so it is never mistaken for a public route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, DispatchController)).toBe('admin/dispatch')
  })

  it('leaves no route relying on a per-method guard instead', () => {
    // If a future method carries its own AdminJwtGuard, the class-level one was
    // probably removed or is about to be — either way the invariant above is
    // the one to keep, and duplicating it per method is how it gets lost.
    for (const name of handlerNames()) {
      expect(methodGuards(name)).not.toContain(AdminJwtGuard)
    }
  })

  it('has routes at all, so the loop above cannot pass by being empty', () => {
    expect(handlerNames().sort()).toEqual(['listCandidates', 'record'])
  })
})
