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

  it('offers the same call, profile and referral as the other two tabs', () => {
    expect(driverBranch).toContain('@refer="askReferred(driver)"')
    expect(driverBranch).not.toContain(':can-refer="false"')
    expect(card).toContain('getPhoneHref(candidate.phone)')
    expect(card).toContain('getTowTruckRoute(candidate.slug)')
    expect(card).toContain('v-if="canRefer"')
  })

  it('asks where the job is before it will record one', () => {
    // A referral is stored against a place — `locationSlug`, `locationName`
    // and `locationType` are all required by the endpoint — and a name typed
    // into a box is not one. This search can never know it, so the dialog
    // asks: `confirmLocation` is null until a place is picked, and the confirm
    // button lives in the branch that only renders once it is not.
    expect(page).toContain("if (mode.value === 'driver') {\n    return confirmPlace.value\n  }")
    expect(page).toContain('<template v-if="confirmLocation === null">')
    expect(page).toMatch(/<template v-else>[\s\S]*markReferred\(confirmTarget\)/)
  })

  it('never guesses the place from the driver', () => {
    // The two shortcuts, both worse than one question. The driver's own base
    // is where the DRIVER is, so filing a Gyumri call under «Կենտրոն» would put
    // a WRONG answer in the log rather than a missing one — and a placeholder
    // would put rows in the referral history that no report can read.
    expect(page).not.toMatch(/locationSlug:\s*['"`]unknown/)
    expect(page).not.toMatch(/confirmPlace\.value\s*=\s*\{[^}]*candidate\./)
    expect(page).not.toContain('confirmTarget.value.base')
  })

  it('clears the asked-for place every time the dialog opens', () => {
    // The place belongs to THIS job. A leftover answer from the previous call
    // is the one mistake this dialog could make silently.
    expect(page).toMatch(/function askReferred\([\s\S]{0,400}confirmPlace\.value = null/)
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
