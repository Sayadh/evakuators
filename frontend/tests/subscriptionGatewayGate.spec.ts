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

  it('offers plan cards in the lock gate only when they could work', () => {
    // Two ways a card there could only refuse, and both must be excluded: no
    // gateway configured, and a driver who is still covered (deactivated for
    // something a payment does not answer — `createPayment` answers 409, so
    // the button would be disabled under a heading promising restoration).
    const gate = source().match(/<SubscriptionPayments\b[^>]*\/>/s)
    expect(gate).not.toBeNull()
    expect(gate![0]).toContain('subscription.paymentsEnabled')
    expect(gate![0]).toContain("subscription.status !== 'paid'")
  })
})

/**
 * The CSP directive that decides whether a driver ever reaches the provider.
 *
 * `form-action` does not fall back to `default-src`, and a blocked submission
 * is silent — no request, no error, only a console violation. Losing this
 * entry breaks paying entirely while every test that mounts a component still
 * passes, which is precisely why it is pinned in a test rather than trusted to
 * a comment.
 */
describe('CSP form-action', () => {
  const NUXT_CONFIG = fileURLToPath(new URL('../nuxt.config.ts', import.meta.url))

  it("allows Idram's payment host as well as 'self'", () => {
    const config = readFileSync(NUXT_CONFIG, 'utf8')
    expect(config).toContain("'form-action': [\"'self'\", 'https://banking.idram.am']")
  })

  it('keeps the host in step with the backend constant', () => {
    // IDRAM_PAYMENT_URL is where the form actually posts; the CSP entry is its
    // origin. If one moves without the other, payments stop.
    const constants = readFileSync(
      fileURLToPath(new URL('../../backend/src/idram/idram.constants.ts', import.meta.url)),
      'utf8',
    )
    const match = constants.match(/IDRAM_PAYMENT_URL = '([^']+)'/)
    expect(match).not.toBeNull()
    const origin = new URL(match![1]).origin
    expect(readFileSync(NUXT_CONFIG, 'utf8')).toContain(`'${origin}'`)
  })
})

/**
 * Paying twice by accident — the button half of a rule the backend enforces
 * with a 409 (`createPayment`). Pinned because the two must agree on WHEN:
 * both key on the backend's `status`, so the block lifts by itself inside the
 * warning window and a driver can always renew before lapsing.
 */
describe('paying while already covered', () => {
  const COMPONENT = fileURLToPath(
    new URL('../components/dashboard/SubscriptionPayments.vue', import.meta.url),
  )

  function component(): string {
    return readFileSync(COMPONENT, 'utf8')
  }

  it("blocks on the backend's status, never on a date compared in the browser", () => {
    expect(component()).toContain("const alreadyCovered = computed(() => props.status === 'paid')")
  })

  it('disables every plan button and refuses the click', () => {
    // Both, not either: `disabled` is a rendering, and a component can still be
    // driven from outside it.
    expect(component()).toContain(':disabled="submittingPlan !== null || alreadyCovered"')
    expect(component()).toContain('if (submittingPlan.value || alreadyCovered.value) return')
  })

  it('says why, rather than leaving a grey button to explain itself', () => {
    expect(component()).toContain('v-if="alreadyCovered"')
    expect(component()).toContain('Ձեր բաժանորդագրությունն ակտիվ է')
  })
})

/**
 * `daysLeft` is floored on the backend, so a subscription with twenty hours
 * left reports 0 while its status is still `due-soon`. «Մնացել է 0 օր»
 * contradicts itself, and the copy has to hold on the one day a driver is most
 * likely to read it.
 */
describe('the last day of a subscription', () => {
  const DASHBOARD_SOURCE = fileURLToPath(new URL('../pages/dashboard.vue', import.meta.url))

  it('says so in words instead of counting down to zero', () => {
    const source = readFileSync(DASHBOARD_SOURCE, 'utf8')
    expect(source).toContain('v-if="subscription.daysLeft > 0"')
    expect(source).toContain('Այսօր վերջին օրն է')
  })
})

/**
 * A deactivated driver's `GET /my/tow-truck` is refused with 403 by design
 * (`MyTowTruckService.getMine` — that refusal is the security boundary), so
 * `load()` always ends in `loadError` for exactly the driver the lock gate
 * exists for. If the error branch renders first they are shown «Պրոֆիլը բեռնել
 * չհաջողվեց» and nothing else: no explanation, and no way to pay their way
 * back on.
 *
 * The order of two `v-else-if` branches is not the kind of thing a reviewer
 * notices, and reversing it breaks the deactivated-for-non-payment case only —
 * an `overdue` driver is still active, loads fine, and looks correct
 * throughout. Hence a test rather than a comment alone.
 */
describe('the lock gate outranks the load error', () => {
  it('renders the payment gate before the error branch', () => {
    const text = readFileSync(fileURLToPath(new URL('../pages/dashboard.vue', import.meta.url)), 'utf8')
    const gate = text.indexOf('v-else-if="subscription?.locked"')
    const error = text.indexOf('v-else-if="loadError"')

    expect(gate).toBeGreaterThan(-1)
    expect(error).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(error)
  })
})


/**
 * `getMine()` is refused with 403 for a deactivated driver by design, so the
 * profile read is EXPECTED to reject for exactly the driver the lock gate
 * exists for. `Promise.all` would reject on it without waiting for the status
 * read, leaving `subscription` null while `loading` goes false — the gate
 * could not render and the error branch would win, undoing the branch ordering
 * pinned above one line earlier.
 */
describe('the dashboard load waits for the subscription status', () => {
  it('settles both reads instead of short-circuiting on the profile', () => {
    const text = readFileSync(fileURLToPath(new URL('../pages/dashboard.vue', import.meta.url)), 'utf8')
    expect(text).toContain('await Promise.allSettled([')
    expect(text).not.toMatch(/await Promise\.all\(\[\s*myTowTruckRepository\.getMine/)
  })
})
