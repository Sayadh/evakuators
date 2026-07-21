export interface PopularLocation {
  name: string
  to: string
  hint: string
}

export const POPULAR_LOCATIONS: PopularLocation[] = [
  { name: 'Երևան', to: '/yerevan', hint: 'Մայրաքաղաք' },
  { name: 'Գյումրի', to: '/regions/shirak/gyumri', hint: 'Շիրակի մարզ' },
  { name: 'Վանաձոր', to: '/regions/lori/vanadzor', hint: 'Լոռու մարզ' },
  { name: 'Սևան', to: '/regions/gegharkunik/sevan', hint: 'Գեղարքունիքի մարզ' },
  { name: 'Գավառ', to: '/regions/gegharkunik/gavar', hint: 'Գեղարքունիքի մարզ' },
  { name: 'Վարդենիս', to: '/regions/gegharkunik/vardenis', hint: 'Գեղարքունիքի մարզ' },
  { name: 'Դիլիջան', to: '/regions/tavush/dilijan', hint: 'Տավուշի մարզ' },
  { name: 'Կապան', to: '/regions/syunik/kapan', hint: 'Սյունիքի մարզ' },
]
