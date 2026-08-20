import { VEHICLE_TYPE_PAGE_LIST } from '~/constants/vehicleTypePages'

export interface NavLink {
  label: string
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
  { label: 'Մոտակա էվակուատորներ', to: '/evakuator' },

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
  ...VEHICLE_TYPE_PAGE_LIST.map((page) => ({ label: page.navLabel, to: `/${page.slug}` })),

  { label: 'Ազատ երթուղիներ', to: '/free-routes' },
]

export const REGISTER_LINK: NavLink = { label: 'Գրանցել էվակուատոր', to: '/register' }

export const FOOTER_PAGES: NavLink[] = [
  { label: 'Մեր մասին', to: '/about' },
  { label: 'Կապ', to: '/contact' },
  // Site-wide, not only in the consent dialog. The dialog links to it too, but
  // a privacy policy reachable only from a modal a driver has to be mid-signup
  // to see is not a published policy — and a visitor who never registers has
  // just as much right to read what the site does with their data.
  { label: 'Գաղտնիության քաղաքականություն', to: '/privacy' },
  { label: 'Գրանցել էվակուատոր', to: '/register' },
]
