import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A driver cannot change where their truck is BASED.
 *
 * The base decides which city page the truck is filed under, whether it counts
 * as a local driver there, and — since top placements are sold — which town's
 * first position it is eligible for. A driver who bought the top of Abovyan
 * could otherwise move to another town the next day and spend the rest of the
 * term there, having paid for somewhere else.
 *
 * The rule is enforced on the server (`CARRY_FROM_CURRENT` in
 * `profile-change-diff.ts` reads the placement from the stored profile and
 * ignores whatever this form sends), and `profile-changes.service.spec.ts`
 * pins that. This file pins the honest half: the page must not offer a control
 * for something the backend will silently discard, because a save that appears
 * to work and changes nothing is worse than no control at all.
 *
 * Source text rather than a mount — this is a 2000-line page whose setup opens
 * four repositories (`docs/testing.md`).
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const dashboard = readFileSync(`${ROOT}pages/dashboard.vue`, 'utf8')

describe('the driver dashboard', () => {
  it('offers no control for the base', () => {
    expect(dashboard).not.toContain('v-model="chosenBaseSlug"')
    expect(dashboard).not.toContain('Ընտրեք մեքենայի հիմնական վայրը')
  })

  it('still shows what the base is', () => {
    // Hidden is not the same as read-only: the driver needs to know what it
    // says, and the coverage error below can be about it.
    expect(dashboard).toContain('Մեքենայի հիմնական վայրը')
    expect(dashboard).toContain('baseLabel')
  })

  it('says who can change it', () => {
    expect(dashboard).toContain('Հիմնական վայրը փոխում է միայն ադմինիստրատորը')
  })

  it('still sends the base, so it stays inside the coverage list', () => {
    // `assertPlacementIsServed` refuses a truck filed under a place it does not
    // serve, and `buildServiceAreas` needs the slug to keep it there.
    expect(dashboard).toContain('buildServiceAreas({ ...form, baseSlug: primarySlug })')
  })

  it('refuses a coverage edit that drops the driver’s own base', () => {
    // Named here rather than failing later on a moderator's Approve button,
    // with a message neither of them can act on.
    expect(dashboard).toContain('այն պետք է մնա սպասարկվող տարածքների մեջ')
  })
})
