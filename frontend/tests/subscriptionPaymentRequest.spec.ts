import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The payment request must carry ONE thing: the plan's id.
 *
 * ## Why this is pinned here as well as on the backend
 *
 * The backend already refuses a body with anything else in it
 * (`CreateSubscriptionPaymentDto` + `forbidNonWhitelisted`), so a frontend
 * that started sending `amount` would break loudly rather than overcharge
 * anyone — the money is safe either way.
 *
 * What that does NOT protect is the driver: the request would fail with a
 * validation error at the moment they press «Վճարել», and the obvious local
 * fix ("the API rejects `amount`, so send what it wants") is the wrong one.
 * This test states the intent at the place where the temptation is, so the
 * next person adding a field reads the reason instead of guessing it.
 *
 * Source text, not behaviour — same reasoning as `repositoryAuthHeaders.spec.ts`:
 * the repository is a thin `$fetch` wrapper with nothing to assert at runtime
 * that would not just be re-testing ofetch.
 */

const REPOSITORY = fileURLToPath(new URL('../repositories/mySubscriptions.repository.ts', import.meta.url))

function source(): string {
  return readFileSync(REPOSITORY, 'utf8')
}

/** The createPayment method's body, from its signature to the end of its call */
function createPaymentBlock(): string {
  const text = source()
  const start = text.indexOf('createPayment(')
  expect(start, 'createPayment() not found — this test is checking nothing').toBeGreaterThan(-1)
  return text.slice(start)
}

describe('mySubscriptionsRepository.createPayment', () => {
  it('posts to the driver-scoped payments route', () => {
    expect(createPaymentBlock()).toContain("'/my/subscription-payments'")
    expect(createPaymentBlock()).toContain("method: 'POST'")
  })

  it('sends the plan id and nothing else', () => {
    expect(createPaymentBlock()).toContain('body: { planId }')
  })

  it('never sends the price, the duration or a driver id', () => {
    // The server decides all three — see the DTO's doc comment. A price that
    // travels from the browser is a price a browser can change.
    const block = createPaymentBlock()
    for (const forbidden of ['amount', 'price', 'durationMonths', 'towTruckId', 'status']) {
      expect(block, `createPayment() must not send \`${forbidden}\``).not.toMatch(
        new RegExp(`\\b${forbidden}\\s*:`),
      )
    }
  })
})
