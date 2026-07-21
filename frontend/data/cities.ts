/**
 * Static data — Հայաստանի աշխարհագրությունը կայուն է և ՉԻ գալու API-ից։
 * Այս ֆայլերը մշտական source of truth են։
 */
import type { City } from '~/types/location'

export const staticCities: City[] = [
  // Արագածոտն
  { id: 1, regionId: 1, name: 'Աշտարակ', slug: 'ashtarak' },
  { id: 2, regionId: 1, name: 'Ապարան', slug: 'aparan' },
  { id: 3, regionId: 1, name: 'Թալին', slug: 'talin' },
  // Արարատ
  { id: 4, regionId: 2, name: 'Արարատ', slug: 'ararat' },
  { id: 5, regionId: 2, name: 'Արտաշատ', slug: 'artashat' },
  { id: 6, regionId: 2, name: 'Մասիս', slug: 'masis' },
  { id: 7, regionId: 2, name: 'Վեդի', slug: 'vedi' },
  // Արմավիր
  { id: 8, regionId: 3, name: 'Արմավիր', slug: 'armavir' },
  { id: 9, regionId: 3, name: 'Վաղարշապատ', slug: 'vagharshapat' },
  { id: 10, regionId: 3, name: 'Մեծամոր', slug: 'metsamor' },
  // Գեղարքունիք
  { id: 11, regionId: 4, name: 'Սևան', slug: 'sevan' },
  { id: 12, regionId: 4, name: 'Գավառ', slug: 'gavar' },
  { id: 13, regionId: 4, name: 'Մարտունի', slug: 'martuni' },
  { id: 14, regionId: 4, name: 'Վարդենիս', slug: 'vardenis' },
  { id: 15, regionId: 4, name: 'Ճամբարակ', slug: 'chambarak' },
  // Կոտայք
  { id: 16, regionId: 5, name: 'Հրազդան', slug: 'hrazdan' },
  { id: 17, regionId: 5, name: 'Աբովյան', slug: 'abovyan' },
  { id: 18, regionId: 5, name: 'Չարենցավան', slug: 'charentsavan' },
  { id: 19, regionId: 5, name: 'Եղվարդ', slug: 'yeghvard' },
  { id: 20, regionId: 5, name: 'Բյուրեղավան', slug: 'byureghavan' },
  { id: 21, regionId: 5, name: 'Նոր Հաճն', slug: 'nor-hachn' },
  { id: 22, regionId: 5, name: 'Ծաղկաձոր', slug: 'tsaghkadzor' },
  // Լոռի
  { id: 23, regionId: 6, name: 'Վանաձոր', slug: 'vanadzor' },
  { id: 24, regionId: 6, name: 'Ալավերդի', slug: 'alaverdi' },
  { id: 25, regionId: 6, name: 'Սպիտակ', slug: 'spitak' },
  { id: 26, regionId: 6, name: 'Ստեփանավան', slug: 'stepanavan' },
  { id: 27, regionId: 6, name: 'Տաշիր', slug: 'tashir' },
  { id: 28, regionId: 6, name: 'Ախթալա', slug: 'akhtala' },
  { id: 29, regionId: 6, name: 'Թումանյան', slug: 'tumanyan' },
  // Շիրակ
  { id: 30, regionId: 7, name: 'Գյումրի', slug: 'gyumri' },
  { id: 31, regionId: 7, name: 'Արթիկ', slug: 'artik' },
  { id: 32, regionId: 7, name: 'Մարալիկ', slug: 'maralik' },
  // Սյունիք
  { id: 33, regionId: 8, name: 'Կապան', slug: 'kapan' },
  { id: 34, regionId: 8, name: 'Գորիս', slug: 'goris' },
  { id: 35, regionId: 8, name: 'Սիսիան', slug: 'sisian' },
  { id: 36, regionId: 8, name: 'Քաջարան', slug: 'kajaran' },
  { id: 37, regionId: 8, name: 'Մեղրի', slug: 'meghri' },
  { id: 38, regionId: 8, name: 'Ագարակ', slug: 'agarak' },
  // Վայոց Ձոր
  { id: 39, regionId: 10, name: 'Եղեգնաձոր', slug: 'yeghegnadzor' },
  { id: 40, regionId: 10, name: 'Վայք', slug: 'vayk' },
  { id: 41, regionId: 10, name: 'Ջերմուկ', slug: 'jermuk' },
  // Տավուշ
  { id: 42, regionId: 9, name: 'Իջևան', slug: 'ijevan' },
  { id: 43, regionId: 9, name: 'Դիլիջան', slug: 'dilijan' },
  { id: 44, regionId: 9, name: 'Բերդ', slug: 'berd' },
  { id: 45, regionId: 9, name: 'Նոյեմբերյան', slug: 'noyemberyan' },
  { id: 46, regionId: 9, name: 'Այրում', slug: 'ayrum' },
]
