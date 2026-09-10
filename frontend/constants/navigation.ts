import { VEHICLE_TYPE_PAGE_LIST } from '~/constants/vehicleTypePages'

export interface NavLink {
  /**
   * An i18n key, not a label.
   *
   * The link list has to be one list — the header, the drawer and the footer
   * all read it — while the words it renders now exist in three languages. A
   * `label` here would either be Armenian everywhere or a third copy of the
   * translations sitting outside `i18n/locales/`, drifting from them.
   */
  labelKey: string
  to: string
}

/**
 * The header and mobile-menu links.
 *
 * Kept deliberately short. Two entries were removed when
 * «Մոտակա էվակուատորներ» was added, because the row had started wrapping onto a
 * second line on a laptop — and a nav that wraps stops being scannable, which
 * is the only job it has:
 *
 * - **«Գլխավոր»** — the logo to its immediate left already goes home, on every
 *   page and on every breakpoint. Two controls a thumb's width apart doing the
 *   same thing is spent space, not redundancy.
 * - **«Ինչպես է աշխատում»** — it was an anchor into a section of the homepage,
 *   not a destination. The section is still there and still linked from the
 *   page itself; it did not need a permanent seat in the top-level nav.
 *
 * Anything added here from now on has to earn its place against the same
 * constraint: it must still fit on one line.
 */
export const NAV_LINKS: NavLink[] = [
  // First: it is the fastest answer to the question most visitors arrive with,
  // and it belongs above the other links rather than after them. The same
  // destination also appears as an in-content block on the main pages
  // (NearestTowTrucksCta) — a nav item is only discoverable to someone already
  // scanning the nav.
  //
  // Stays here even while NEAREST_SEARCH_ENABLED is false. The link is how
  // visitors learn the feature is coming, and the page it leads to is written
  // as an announcement rather than an error — see constants/features.ts.
  { labelKey: 'nav.nearest', to: '/evakuator' },

  // These two replaced «Մարզեր» and «Երևան», which is a change of *question*,
  // not a reshuffle. Geography answers "where are you"; the site already knows
  // that from the page a visitor is on, from the search box and from the
  // footer. These answer "what do you need" — a crane, or something that can
  // carry a bus — which geography cannot answer at all and which is what
  // someone with an unusual vehicle actually arrives searching for.
  //
  // Nothing was orphaned. The footer already lists every individual marz and
  // district on every page, and its two column HEADINGS now link to the hubs
  // themselves (`/regions`, `/yerevan`) — see AppFooter.vue. Both stay in the
  // sitemap.
  // Keyed by slug rather than carrying `page.navLabel`: the label is the one
  // part of these pages that has three versions, and it lives with the other
  // translations instead of in the page definition.
  ...VEHICLE_TYPE_PAGE_LIST.map((page) => ({
    labelKey: `vehicleTypeNav.${page.slug}`,
    to: `/${page.slug}`,
  })),

  { labelKey: 'nav.freeRoutes', to: '/free-routes' },
]

export const REGISTER_LINK: NavLink = { labelKey: 'nav.register', to: '/register' }

/**
 * The driver's way back into their own profile, in the header and the drawer.
 *
 * `/login` used to be linked from nowhere: a driver who registered, closed the
 * tab and came back had to type the URL or dig out an old email — on a site
 * whose entire paid product is that profile.
 *
 * One label for both states, deliberately. A signed-in driver sees «Մուտք»
 * too, and `driver-guest` sends them straight on to `/dashboard`, so the link
 * is never a dead end. The alternative — swapping the label once the session
 * is known — meant reading a localStorage-backed store into the markup of the
 * one component that renders on every page, which the server cannot know and
 * so renders differently: a hydration mismatch site-wide, in exchange for a
 * word. A constant has no state to disagree about.
 */
export const LOGIN_LINK: NavLink = { labelKey: 'nav.login', to: '/login' }

export const FOOTER_PAGES: NavLink[] = [
  { labelKey: 'nav.about', to: '/about' },
  { labelKey: 'nav.contact', to: '/contact' },
  // Site-wide, not only in the consent dialog. The dialog links to it too, but
  // a privacy policy reachable only from a modal a driver has to be mid-signup
  // to see is not a published policy — and a visitor who never registers has
  // just as much right to read what the site does with their data.
  { labelKey: 'nav.privacy', to: '/privacy' },
  { labelKey: 'nav.register', to: '/register' },
]
