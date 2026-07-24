export interface NavLink {
  label: string
  to: string
}

export const NAV_LINKS: NavLink[] = [
  { label: 'Գլխավոր', to: '/' },
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
