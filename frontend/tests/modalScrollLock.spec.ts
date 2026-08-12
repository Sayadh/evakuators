import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * `AppModal` is a `position: fixed` overlay Teleported to `<body>`, exactly
 * like `AppDrawer` — but unlike `AppDrawer`, it never locked body scroll while
 * open. A short list inside the modal has nothing of its own to scroll, and
 * without the lock a scroll gesture over it instead scrolls the (often much
 * longer) page underneath, which does not visually move because the overlay
 * covering it is fixed to the viewport regardless. That reads as "the
 * dialog's own scroll doesn't work" — nothing seems to happen — since the
 * only thing that actually moved is out of sight.
 *
 * Source-text check rather than a mounted component: this repo has no
 * component test runtime (docs/testing.md), and the property that matters —
 * body scroll toggling with `modelValue` — is a DOM side effect a jsdom-less
 * suite cannot exercise anyway.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const modal = readFileSync(`${ROOT}components/common/AppModal.vue`, 'utf8')
const drawer = readFileSync(`${ROOT}components/common/AppDrawer.vue`, 'utf8')

describe('AppModal locks body scroll while open, like AppDrawer already does', () => {
  it('sets and clears overflow:hidden on the body', () => {
    expect(modal).toContain("document.body.style.overflow = open ? 'hidden' : ''")
  })

  it('is guarded for SSR, where document does not exist', () => {
    expect(modal).toContain('import.meta.client')
  })

  it('restores scroll on unmount, not just on close', () => {
    // A modal that is force-closed by a route change (v-model never flips to
    // false) must not leave the whole site unscrollable behind it.
    expect(modal).toContain('onUnmounted')
  })

  it('matches the pattern AppDrawer already uses', () => {
    expect(drawer).toContain("document.body.style.overflow = open ? 'hidden' : ''")
  })
})
