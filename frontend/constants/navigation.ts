export interface NavLink {
  label: string
  to: string
}

export const NAV_LINKS: NavLink[] = [
  { label: 'Գլխավոր', to: '/' },
  // Second, right after the homepage: it is the fastest answer to the question
  // most visitors arrive with, and it belongs above the browse-by-geography
  // links rather than after them. The same destination also appears as an
  // in-content block on the main pages (NearestTowTrucksCta) — a nav item is
  // only discoverable to someone already scanning the nav.
  { label: 'Մոտակա էվակուատորներ', to: '/evakuator' },
  { label: 'Մարզեր', to: '/regions' },
  { label: 'Երևան', to: '/yerevan' },
  { label: 'Ազատ երթուղիներ', to: '/free-routes' },
  { label: 'Ինչպես է աշխատում', to: '/#how-it-works' },
]

export const REGISTER_LINK: NavLink = { label: 'Գրանցել էվակուատոր', to: '/register' }

export const FOOTER_PAGES: NavLink[] = [
  { label: 'Մեր մասին', to: '/about' },
  { label: 'Կապ', to: '/contact' },
  { label: 'Գրանցել էվակուատոր', to: '/register' },
]
