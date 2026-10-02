import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * What a dispatch card says about a driver.
 *
 * The three facts added here are the ones a dispatcher decides on while the
 * customer is still describing the car — will it fit, will it load if the
 * wheels will not turn, and is this driver busy or idle — so each one has a
 * reason to be on a card that is read in about twenty seconds.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const page = readFileSync(`${ROOT}pages/admin/dispatch.vue`, 'utf8')

describe('the dispatch card', () => {
  it('prints capacity through the same function the public profile uses', () => {
    // `capacityTons` is a float derived from a band the driver picked. Printing
    // it raw would show «12 տ» to a driver who only ever said «10 տոննայից
    // ավելի» — the exact bug `capacityDisplayText` exists to prevent.
    expect(page).toContain('capacityDisplayText(candidate.capacityTons)')
    expect(page).not.toContain('candidate.capacityTons }} տ')
  })

  it('shows the wheel skates only when the truck has them', () => {
    // Several vehicle types are never asked (`asksWheelSkates`), so `false`
    // means "not this truck", never "we did not ask" — and «Ռոլիկներ՝ ոչ»
    // would be answering a question nobody put to that driver.
    expect(page).toContain('v-if="candidate.wheelSkates"')
  })

  it('says how many days the call figure covers, on the row itself', () => {
    // A bare number invites the reader to assume all-time, which is the one
    // thing it is not.
    expect(page).toContain('candidate.callsRecent')
    expect(page).toContain('30 օր')
  })

  it('keeps our own referral counter beside it', () => {
    // Demand next to supply: how often customers rang this driver, against how
    // often we handed them a job. Replacing one with the other would lose the
    // comparison that makes either useful.
    expect(page).toContain('candidate.dispatchesThisMonth')
  })
})
