import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Changing language from a phone.
 *
 * The switcher lived in the footer and nowhere else, which meant the one
 * visitor who needs it — the one who cannot read the page they are on — had to
 * read to the bottom of that page to find it. It is now in the header bar too,
 * while the nav is a burger.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const header = readFileSync(`${ROOT}components/layout/AppHeader.vue`, 'utf8')
const footer = readFileSync(`${ROOT}components/layout/AppFooter.vue`, 'utf8')
const component = readFileSync(`${ROOT}components/layout/LanguageSwitcher.vue`, 'utf8')

describe('the header carries the language switcher on a phone', () => {
  it('renders the inline variant, not the dropdown', () => {
    // Three codes in the bar is the whole feature. A dropdown would add a tap
    // and a surface to the one screen with room for neither.
    expect(header).toContain('<LanguageSwitcher variant="inline" class="header__lang" />')
  })

  it('hides it at the burger\'s own breakpoint, not at a width of its own', () => {
    // One variable, so "mobile" cannot come to mean two different widths
    // inside one component.
    const rule = header.slice(header.indexOf('&__lang {'), header.indexOf('&__login {'))
    expect(rule).toContain('@media (min-width: $nav-breakpoint)')
    expect(rule).toContain('display: none')
    expect(rule).not.toMatch(/min-width:\s*\d+px/)
  })

  it('keeps the full language names out of the bar', () => {
    // The component unhides them at 1024px, which is inside the range the
    // header shows this in — «HY Հայերեն RU Русский EN English» in a header bar.
    expect(component).toMatch(/&__full \{\s*display: none;\s*@media \(min-width: 1024px\)/)
    const rule = header.slice(header.indexOf('&__lang {'), header.indexOf('&__login {'))
    expect(rule).toContain(':deep(.lang__full)')
  })

  it('leaves the footer its own copy', () => {
    // The header's hides above the burger breakpoint; on a desktop the footer
    // is the only one left, so it is not redundant.
    expect(footer).toContain('<LanguageSwitcher variant="inline"')
  })
})
