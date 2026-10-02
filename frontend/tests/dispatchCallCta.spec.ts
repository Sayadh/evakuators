import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The «Զանգահարեք մեզ» button, pinned as source text.
 *
 * Three of these are invariants that fail SILENTLY in production if they
 * regress — nothing throws, the button keeps working, and only a report weeks
 * later shows the hole:
 *
 * 1. the `dispatch-cta__call` class, which is the ONLY thing telling the Meta
 *    Pixel's document-level `tel:` listener that this click is a dispatch call
 *    and not a support call (`utils/pixelContactSource.ts`);
 * 2. the absence of a `trackMetaPixelContact` call here, since that same
 *    listener already fires one — adding it would double every Contact
 *    conversion, the exact trap documented in `usePhoneActions`;
 * 3. `placement` travelling with the GA event, which is what answers whether
 *    the three quieter placements earn the space they take.
 *
 * Source text rather than a mount, same reasoning as
 * `subscriptionGatewayGate.spec.ts` — the wiring is the subject, not the
 * render, and this repo has no runtime for Nuxt components (`docs/testing.md`).
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const component = readFileSync(`${ROOT}components/dispatch/DispatchCallCta.vue`, 'utf8')
const header = readFileSync(`${ROOT}components/layout/AppHeader.vue`, 'utf8')
const hero = readFileSync(`${ROOT}components/home/HeroSection.vue`, 'utf8')
const layout = readFileSync(`${ROOT}layouts/default.vue`, 'utf8')

describe('DispatchCallCta wiring', () => {
  it('keeps the class the Pixel buckets on, in every variant', () => {
    // All four anchors carry it — the header link, the dialog's dial link, the
    // shared card one and the empty-state one. If any loses it, those clicks
    // silently become `site_contact`. The count is pinned so that ADDING an
    // anchor is a deliberate edit here rather than something that slips in
    // unclassed.
    const anchors = component.match(/:href="phoneHref"/g) ?? []
    const classed = component.match(/class="dispatch-cta__call/g) ?? []
    expect(anchors.length).toBe(4)
    expect(classed.length).toBe(anchors.length)
  })

  it('gives the icon-only floating button a spoken label', () => {
    // It has no text at all, so without this it is an unlabelled control — and
    // the number is what a screen reader has to be able to announce.
    expect(component).toMatch(/dispatch-cta__fab"[\s\S]{0,200}aria-label/)
  })

  it('makes the floating button ask before it dials', () => {
    // 60px of colour parked over a list being scrolled with the same thumb gets
    // tapped by accident, and an accidental tap on a `tel:` link is a phone
    // call to a stranger — already ringing on some phones.
    expect(component).toMatch(/class="dispatch-cta__fab"[\s\S]{0,300}@click="confirming = true"/)
    expect(component).toContain('<AppModal v-model="confirming"')
    expect(component).toContain('Չեղարկել')
  })

  it('counts the call from the dial link, not from opening the dialog', () => {
    // Otherwise `dispatch_call_click` would mean "times the button was
    // brushed", which is the opposite of what it is read for.
    expect(component).toMatch(/dispatch-cta__confirm-call"[\s\S]{0,120}@click="onClick"/)
    expect(component).not.toMatch(/dispatch-cta__fab"[\s\S]{0,300}@click="onClick"/)
  })

  it('does not fire a Meta Contact event of its own', () => {
    // A CALL, not the word — the doc comment names the helper precisely so the
    // next person understands why it is missing, and must stay allowed to.
    expect(component).not.toMatch(/trackMetaPixelContact\s*\(/)
    expect(component).not.toMatch(/import .*trackMetaPixelContact/)
  })

  it('counts the click with the placement attached', () => {
    expect(component).toContain('trackDispatchCallClick(props.variant)')
  })

  it('dials the operator’s number from the one constant that defines it', () => {
    expect(component).toContain("import { CONTACT_PHONE } from '~/constants/site'")
    expect(component).toContain('getPhoneHref(CONTACT_PHONE)')
  })
})

describe('DispatchCallCta placements', () => {
  it('sits in the header, before the register button', () => {
    const cta = header.indexOf('<DispatchCallCta variant="header" />')
    const register = header.indexOf('header__register')
    expect(cta).toBeGreaterThan(-1)
    expect(cta).toBeLessThan(register)
  })

  it('sits above the homepage search, and stays quieter than it', () => {
    // Position and weight are split on purpose. Somebody whose car has just
    // stopped is offered a person before a list — but the listings are what
    // drivers pay to be in, so the search box keeps the louder treatment and
    // this stays outlined. Both halves are the decision; a filled button here
    // would be the half that was not asked for.
    const search = hero.indexOf('<LocationSearch')
    const cta = hero.indexOf('<DispatchCallCta variant="hero"')
    expect(cta).toBeGreaterThan(-1)
    expect(cta).toBeLessThan(search)
    expect(cta).toBeGreaterThan(hero.indexOf('hero__subtitle'))
  })

  it('leaves the hero with the number alone, and keeps the heading elsewhere', () => {
    // On the homepage the block sits under «Ընտրեք մարզը կամ քաղաքը…», and a
    // second sentence of instruction there is one more thing to read before
    // the first thing to do. A listing page's heading does different work —
    // it tells someone scrolling past a wall of drivers that they need not
    // pick one — so the banner keeps it.
    expect(component).toContain(`<div v-if="variant !== 'hero'" class="dispatch-cta__text">`)
    // Left out, not hidden: the link's own aria-label still says «Զանգահարել
    // մեզ՝ +374…», so nothing is lost — and hidden markup is markup that
    // comes back.
    expect(component).toContain("t('dispatch.callUsWithNumber'")
  })

  it('keeps the hero button outlined now that it comes first', () => {
    // The other half of the same decision. Moving it above the search made it
    // the first thing offered; filling it would also make it the loudest, and
    // the listings below are what drivers pay to be found through.
    const heroRule = component.slice(component.indexOf('&--hero {'), component.indexOf('&--banner {'))
    expect(heroRule).toContain('border: 2px solid')
    expect(heroRule).not.toContain('background: var(--color-accent)')
  })

  it('renders the floating button once, in the layout, behind the route rule', () => {
    expect(layout).toContain('showsDispatchBar(route.path)')
    expect(layout).toContain('<DispatchCallCta v-if="showDispatchBar" variant="bar" />')
  })

  it('holds the floating button back until the visitor has scrolled', () => {
    // Both offers in the first viewport is the message twice, and a strip of
    // the listing covered for nothing.
    expect(layout).toContain('y.value > DISPATCH_BAR_SCROLL_THRESHOLD')
  })
})

describe('DispatchCallCta on the listing pages', () => {
  const PAGES = [
    'pages/regions/index.vue',
    'pages/regions/[region]/index.vue',
    'pages/regions/[region]/[city].vue',
    'pages/yerevan/index.vue',
    'pages/yerevan/[district].vue',
  ]

  it.each(PAGES)('%s carries the banner', (page) => {
    expect(readFileSync(`${ROOT}${page}`, 'utf8')).toContain('<DispatchCallCta variant="banner"')
  })

  it.each(PAGES)('%s keeps it below the page heading', (page) => {
    const source = readFileSync(`${ROOT}${page}`, 'utf8')
    expect(source.indexOf('<h1')).toBeLessThan(source.indexOf('<DispatchCallCta'))
  })
})
