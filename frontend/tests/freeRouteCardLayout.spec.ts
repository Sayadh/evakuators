import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * «Զանգահարել» sits at the bottom of every free-route card, level with the
 * others in its row.
 *
 * The cards are grid items, so a row stretches all of them to the tallest —
 * while the content genuinely varies: one route carries a description, another
 * has a time range that wraps because it crosses midnight. Without
 * `margin-top: auto` the button lands at a different height in each card, and
 * the one element a reader is aiming for is the one that keeps moving.
 *
 * Pinned as source text because this repo has no runtime to mount a component
 * in (`docs/testing.md`) and no way to compute layout at all — but the single
 * declaration that does the work is easy to lose in a style refactor, and its
 * absence looks like nothing more than untidy spacing in a screenshot.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const card = readFileSync(`${ROOT}components/free-routes/FreeRouteCard.vue`, 'utf8')
const truckCard = readFileSync(`${ROOT}components/tow-truck/TowTruckCard.vue`, 'utf8')

describe('free route card layout', () => {
  it('pushes the call button to the bottom of the card', () => {
    expect(card).toMatch(/&__call \{[\s\S]{0,600}margin-top: auto;/)
  })

  it('keeps the card a column, which is what makes that work', () => {
    expect(card).toMatch(/\.route-card \{[\s\S]{0,200}flex-direction: column;/)
  })

  it('matches how the tow truck cards already do it', () => {
    // The house pattern, not a one-off: if that one changes, this note should
    // send whoever changed it here too.
    expect(truckCard).toContain('margin-top: auto;')
  })
})
