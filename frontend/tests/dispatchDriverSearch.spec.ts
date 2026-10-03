import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * «Ըստ վարորդի» — the dispatch screen's third search.
 *
 * The other two answer "who should take this job". This one answers "where is
 * this driver": the dispatcher referred somebody an hour ago and now needs
 * them on the phone, and the alternative was leaving the screen mid-call.
 *
 * Source-read, the same way `featuredStripOrder.spec.ts` is: every property
 * worth protecting here is a decision in the file, and mounting the page would
 * pin its markup instead — which is the part that should stay free to change.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const page = readFileSync(`${ROOT}pages/admin/dispatch.vue`, 'utf8')
const card = readFileSync(`${ROOT}components/dispatch/DispatchCandidateCard.vue`, 'utf8')

/** Everything from the third tab's branch to the end of the template */
const driverBranch = page.slice(
  page.indexOf('<!-- Find a driver, rather than find a driver FOR something'),
  page.indexOf('<!-- The only irreversible action here'),
)

describe('the dispatch screen can find a driver by name or phone', () => {
  it('is a third mode, not a replacement for either of the other two', () => {
    expect(page).toContain("type SearchMode = 'place' | 'coordinates' | 'driver'")
    expect(page).toContain("setMode('driver')")
    // The coordinate branch used to be the `v-else`; a third mode falling
    // through to it would render the wrong search.
    expect(page).toContain(`v-else-if="mode === 'coordinates'"`)
  })

  it('asks the dispatch endpoint, so the card can be the same card', () => {
    // It read `GET /admin/tow-trucks?search=` first, on the reasoning that the
    // panel already knew how to match a driver. The matching was fine; the
    // shape was not — that endpoint answers with the panel's own row, with no
    // rating, referral counts, call figure or subscription status, so the same
    // driver looked thinner here than on the other two tabs.
    expect(page).toContain('adminRepository.listDispatchCandidatesBySearch(search)')
    expect(page).not.toContain('adminRepository.listTowTrucks({')
    expect(driverBranch).toContain('driverResults')
  })

  it('offers a call and a profile, and no referral', () => {
    // A referral is stored against a place — `locationSlug`, `locationName`
    // and `locationType` are all required by the endpoint — and a name typed
    // into a box is not one. A placeholder location would put rows in the
    // referral log that no report can read.
    expect(driverBranch).toContain(':can-refer="false"')
    expect(driverBranch).not.toContain('askReferred')
    // The card still dials and still links: the facts and the phone are the
    // same everywhere, only the write is missing.
    expect(card).toContain('getPhoneHref(candidate.phone)')
    expect(card).toContain('getTowTruckRoute(candidate.slug)')
    expect(card).toContain('v-if="canRefer"')
  })

  it('debounces the request, and does not leave one armed behind it', () => {
    // The place search reads a static index in memory and needs none of this.
    // This one is a request, typed into while the operator is talking — and a
    // debounce that outlives the page fires for a screen nobody is looking at,
    // with a token that may already be gone.
    expect(page).toContain('DRIVER_SEARCH_DEBOUNCE_MS')
    expect(page).toMatch(/onUnmounted\(\(\) => \{\s*if \(driverTimer !== null\) clearTimeout\(driverTimer\)/)
  })

  it('says a driver is deactivated rather than letting the card look normal', () => {
    // The other two searches only ever return active drivers, so the line is
    // dead weight there and the one thing that matters here: somebody ringing
    // about a job they were referred last week is quite often the driver who
    // was deactivated since.
    expect(card).toContain('v-if="!candidate.isActive"')
  })
})
