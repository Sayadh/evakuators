/**
 * Static data — Հայաստանի աշխարհագրությունը կայուն է և ՉԻ գալու API-ից։
 * Այս ֆայլերը մշտական source of truth են։
 */
import type { District } from '~/types/location'

export const staticDistricts: District[] = [
  { id: 1, name: 'Աջափնյակ', slug: 'ajapnyak' },
  { id: 2, name: 'Արաբկիր', slug: 'arabkir' },
  { id: 3, name: 'Ավան', slug: 'avan' },
  { id: 4, name: 'Դավթաշեն', slug: 'davtashen' },
  { id: 5, name: 'Էրեբունի', slug: 'erebuni' },
  { id: 6, name: 'Կենտրոն', slug: 'kentron' },
  { id: 7, name: 'Մալաթիա-Սեբաստիա', slug: 'malatia-sebastia' },
  { id: 8, name: 'Նոր Նորք', slug: 'nor-nork' },
  { id: 9, name: 'Նորք-Մարաշ', slug: 'nork-marash' },
  { id: 10, name: 'Նուբարաշեն', slug: 'nubarashen' },
  { id: 11, name: 'Շենգավիթ', slug: 'shengavit' },
  { id: 12, name: 'Քանաքեռ-Զեյթուն', slug: 'kanaker-zeytun' },
]
