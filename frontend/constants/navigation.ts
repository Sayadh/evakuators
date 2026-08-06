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
  // and it belongs above the browse-by-geography links rather than after them.
  // The same destination also appears as an in-content block on the main pages
  // (NearestTowTrucksCta) — a nav item is only discoverable to someone already
  // scanning the nav.
  { label: 'Մոտակա էվակուատորներ', to: '/evakuator' },
  { label: 'Մարզեր', to: '/regions' },
  { label: 'Երևան', to: '/yerevan' },
  { label: 'Ազատ երթուղիներ', to: '/free-routes' },
]

export const REGISTER_LINK: NavLink = { label: 'Գրանցել էվակուատոր', to: '/register' }

export const FOOTER_PAGES: NavLink[] = [
  { label: 'Մեր մասին', to: '/about' },
  { label: 'Կապ', to: '/contact' },
  { label: 'Գրանցել էվակուատոր', to: '/register' },
]
