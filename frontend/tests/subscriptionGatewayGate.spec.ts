import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Nothing about paying is shown to a driver until the backend can actually
 * take a payment.
 *
 * ## Why this is pinned
 *
 * The three URLs have to be registered with Idram before Idram issues the
 * credentials, so this feature ships to production live and inert: the backend
 * answers `paymentsEnabled: false`, refuses nothing
 * (`SubscriptionActiveGuard`), and the dashboard must show no plan cards, no
 * reminder and no lock. Dropping any one of those `v-if`s would put a «Վճարել»
 * in front of every driver that leads to a gateway which is not there — and,
 * for the fleet the backfill migration turns `overdue`, a lock they could not
 * pay their way out of.
 *
 * Source text, not a mount: `pages/dashboard.vue` is a 1600-line page whose
 * setup opens four repositories on mount, and the thing worth stating here is
 * the condition, not the render. Same reasoning as
 * `subscriptionPaymentRequest.spec.ts`.
 */

const DASHBOARD = fileURLToPath(new URL('../pages/dashboard.vue', import.meta.url))

function source(): string {
  return readFileSync(DASHBOARD, 'utf8')
}

describe('dashboard payment gate', () => {
  it('renders the «Վճարումներ» section only when the gateway is configured', () => {
    expect(source()).toContain(
      '<details v-if="subscription?.paymentsEnabled" class="dashboard-section dashboard-section--payments">',
    )
  })

  it('shows no reminder dialog for either money moment without a gateway', () => {
    // `overdue` is already impossible (the backend forces `locked: false`),
    // but `due-soon` comes straight off the period and is not.
    expect(source()).toContain('if (!status.paymentsEnabled) return null')
  })

  it('keeps the deactivation dialog, which is not a billing state', () => {
    // Ordered BEFORE the gateway check on purpose: an admin took this page off
    // the site, and the driver is told so whether or not there is a gateway.
    const text = source()
    expect(text.indexOf("if (!status.isActive) return 'deactivated'")).toBeGreaterThan(-1)
    expect(text.indexOf("if (!status.isActive) return 'deactivated'")).toBeLessThan(
      text.indexOf('if (!status.paymentsEnabled) return null'),
    )
  })

  it('does not offer plan cards inside the lock gate without a gateway', () => {
    expect(source()).toContain('<SubscriptionPayments v-if="subscription.paymentsEnabled" />')
  })
})
