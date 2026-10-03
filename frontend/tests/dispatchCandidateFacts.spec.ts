import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * What a dispatch card says about a driver.
 *
 * One component for all three searches, which is the point: these facts are
 * properties of the driver, not of how the dispatcher happened to find them.
 * They were duplicated across three blocks of markup until the third tab
 * showed a visibly thinner card than the first two for the same person.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const card = readFileSync(`${ROOT}components/dispatch/DispatchCandidateCard.vue`, 'utf8')
const page = readFileSync(`${ROOT}pages/admin/dispatch.vue`, 'utf8')

describe('the dispatch card', () => {
  it('prints capacity through the same function the public profile uses', () => {
    // `capacityTons` is a float derived from a band the driver picked. Printing
    // it raw would show «12 տ» to a driver who only ever said «10 տոննայից
    // ավելի» — the exact bug `capacityDisplayText` exists to prevent.
    expect(card).toContain('capacityDisplayText(candidate.capacityTons)')
    expect(card).not.toContain('candidate.capacityTons }} տ')
  })

  it('shows the wheel skates only when the truck has them', () => {
    // Several vehicle types are never asked (`asksWheelSkates`), so `false`
    // means "not this truck", never "we did not ask".
    expect(card).toContain('v-if="candidate.wheelSkates"')
  })

  it('names the vehicle type between the make and the tonnage', () => {
    expect(card).toContain('vehicleTypeShortLabel(candidate.vehicleType)')
  })

  it('says how many days the call figure covers, on the row itself', () => {
    // A bare number invites the reader to assume all-time, which is the one
    // thing it is not.
    expect(card).toContain('candidate.callsRecent')
    expect(card).toContain('30 օր')
  })

  it('keeps our own referral counter beside it', () => {
    // Demand next to supply. Replacing one with the other would lose the
    // comparison that makes either useful.
    expect(card).toContain('candidate.dispatchesThisMonth')
  })

  it('is the only place the page draws a candidate', () => {
    // The regression this prevents is the one that prompted the component: a
    // field added to one of three copies of the markup.
    expect(page).not.toContain('class="dispatch__card"')
    expect(page.match(/<DispatchCandidateCard/g)?.length).toBe(3)
  })
})
