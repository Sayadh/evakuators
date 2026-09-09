import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The dispatch screen is for one person — the dispatcher — and nobody else.
 *
 * ## Where the enforcement actually is
 *
 * On the server. `DispatchController` carries `@UseGuards(AdminJwtGuard)` at
 * controller level, so both the candidate list and the referral write are
 * unreachable without an admin token; `backend/test/dispatch-admin-only.spec.ts`
 * pins that. Nothing in this file is a security boundary, and it must not be
 * read as one: a page is HTML, and HTML is downloadable.
 *
 * ## Why pin the page too
 *
 * Because the failure this catches is not a breach, it is a leak of the
 * *shape* of the operation. Without the gate a signed-out visitor who guesses
 * `/admin/dispatch` gets the real screen — every place name, every filter, an
 * empty driver list and a «Ուղղորդված է» button — and a screen that renders
 * and then fails on every request reads as a broken product, not a locked
 * door. Every other page under `pages/admin/` refuses to render its body the
 * same way (`payments.vue`, `index.vue`), and this pins that this one keeps
 * doing it too.
 *
 * ## Why not a route middleware
 *
 * There is no `admin-auth` middleware in this project — the panel has always
 * gated in-template. Adding one for a single page would mean two admin gates
 * with different behaviour (a redirect vs. an EmptyState) and no more safety
 * than `AdminJwtGuard` already gives. This test states the convention so the
 * next person reaches for the existing one.
 *
 * Source text rather than a mount, same reasoning as
 * `subscriptionGatewayGate.spec.ts`: the condition is the subject, not the
 * render, and mounting this page would mean standing up the admin store and a
 * repository for a `v-if`.
 */

const PAGE = fileURLToPath(new URL('../pages/admin/dispatch.vue', import.meta.url))

function source(): string {
  return readFileSync(PAGE, 'utf8')
}

describe('dispatch page, admin only', () => {
  it('refuses its body to a visitor who is not signed in as admin', () => {
    expect(source()).toContain('v-else-if="!adminAuth.isLoggedIn"')
  })

  it('puts everything else behind that gate, not beside it', () => {
    // The `v-else` is the whole point: without it the two EmptyStates would
    // render *above* a fully working screen instead of in place of it.
    expect(source()).toContain('<template v-else>')
  })

  it('says so on the mock build too, where there is no backend to refuse', () => {
    expect(source()).toContain('v-if="!apiEnabled"')
  })

  it('does not invent a middleware the project does not have', () => {
    expect(source()).not.toContain("middleware: 'admin-auth'")
  })
})
