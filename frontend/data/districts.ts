/**
 * Static data — Հայաստանի աշխարհագրությունը կայուն է և ՉԻ գալու API-ից։
 * Այս ֆայլերը մշտական source of truth են։
 */
import type { District } from '~/types/location'

export const staticDistricts: District[] = [
  {
    id: 1,
    name: 'Աջափնյակ',
    slug: 'ajapnyak',
    aliases: ['ajapnyak', 'achapnyak'],
  },
  {
    id: 2,
    name: 'Արաբկիր',
    slug: 'arabkir',
    aliases: ['arabkir'],
  },
  {
    id: 3,
    name: 'Ավան',
    slug: 'avan',
    aliases: ['avan'],
  },
  {
    id: 4,
    name: 'Դավթաշեն',
    slug: 'davtashen',
    aliases: ['davtashen'],
  },
  {
    id: 5,
    name: 'Էրեբունի',
    slug: 'erebuni',
    aliases: ['erebuni'],
  },
  {
    id: 6,
    name: 'Կենտրոն',
    slug: 'kentron',
    aliases: ['kentron', 'center', 'centre', 'centr'],
  },
  {
    id: 7,
    name: 'Մալաթիա-Սեբաստիա',
    slug: 'malatia-sebastia',
    aliases: [
      'malatia-sebastia',
      'malatia sebastia',
      'malatia',
      'sebastia',
      'bangladesh',
      'բանգլադեշ',
    ],
  },
  {
    id: 8,
    name: 'Նոր Նորք',
    slug: 'nor-nork',
    aliases: [
      'nor-nork',
      'nor nork',
      'nork masiv',
      'nor nork masiv',
      'masiv',
      'massiv',
      'մասիվ',
      'նոր նորքի զանգված',
    ],
  },
  {
    id: 9,
    name: 'Նորք-Մարաշ',
    slug: 'nork-marash',
    aliases: ['nork-marash', 'nork marash'],
  },
  {
    id: 10,
    name: 'Նուբարաշեն',
    slug: 'nubarashen',
    aliases: ['nubarashen'],
  },
  {
    id: 11,
    name: 'Շենգավիթ',
    slug: 'shengavit',
    aliases: ['shengavit', 'shangavit', 'charbakh', 'չարբախ'],
  },
  {
    id: 12,
    name: 'Քանաքեռ-Զեյթուն',
    slug: 'kanaker-zeytun',
    aliases: [
      'kanaker-zeytun',
      'kanaker zeytun',
      'qanaqer zeytun',
      'kanaker',
      'zeytun',
      'քանաքեռ',
      'զեյթուն',
    ],
  },
]