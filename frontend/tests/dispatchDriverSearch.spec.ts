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

  it('asks the endpoint the admin panel already asks', () => {
    // `GET /admin/tow-trucks?search=` matches driver name, company name and
    // phone server-side. A dispatch-specific endpoint would be a second
    // definition of "matches a driver", and the day the two disagreed, the
    // panel and this screen would disagree about who exists.
    expect(page).toContain('adminRepository.listTowTrucks({')
    expect(driverBranch).toContain('driverResults')
  })

  it('offers a call and a profile, and no referral', () => {
    // A referral is stored against a place — `locationSlug`, `locationName`
    // and `locationType` are all required by the endpoint — and a name typed
    // into a box is not one. A placeholder location would put rows in the
    // referral log that no report can read.
    expect(driverBranch).toContain('getPhoneHref(driver.phone)')
    expect(driverBranch).toContain('getTowTruckRoute(driver.slug)')
    expect(driverBranch).not.toContain('askReferred')
    // The button itself, not the words: the comment above the branch says
    // «Ուղղորդված է» while explaining why the button is absent.
    expect(driverBranch).not.toContain('<AppButton')
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
    // The other two lists only ever contain active drivers. This one finds
    // anyone by name, and a deactivated driver is exactly who an operator
    // might be calling about.
    expect(driverBranch).toContain('v-if="!driver.isActive"')
  })
})
