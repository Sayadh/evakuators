/**
 * Static data — Հայաստանի աշխարհագրությունը կայուն է և ՉԻ գալու API-ից։
 * Այս ֆայլերը մշտական source of truth են։
 */
import type { City } from '~/types/location'

export const staticCities: City[] = [
  {
    id: 1,
    regionId: 1,
    name: 'Աշտարակ',
    slug: 'ashtarak',
    aliases: ['ashtarak'],
  },
  {
    id: 2,
    regionId: 1,
    name: 'Ապարան',
    slug: 'aparan',
    aliases: ['aparan'],
  },
  {
    id: 3,
    regionId: 1,
    name: 'Թալին',
    slug: 'talin',
    aliases: ['talin'],
  },

  // Արարատ
  {
    id: 4,
    regionId: 2,
    name: 'Արարատ',
    slug: 'ararat',
    aliases: ['ararat'],
  },
  {
    id: 5,
    regionId: 2,
    name: 'Արտաշատ',
    slug: 'artashat',
    aliases: ['artashat'],
  },
  {
    id: 6,
    regionId: 2,
    name: 'Մասիս',
    slug: 'masis',
    aliases: ['masis'],
  },
  {
    id: 7,
    regionId: 2,
    name: 'Վեդի',
    slug: 'vedi',
    aliases: ['vedi'],
  },

  // Արմավիր
  {
    id: 8,
    regionId: 3,
    name: 'Արմավիր',
    slug: 'armavir',
    aliases: ['armavir', 'hoktemberyan', 'hoktemberian', 'հոկտեմբերյան'],
  },
  {
    id: 9,
    regionId: 3,
    name: 'Վաղարշապատ',
    slug: 'vagharshapat',
    aliases: ['vagharshapat', 'ejmiatsin', 'echmiadzin', 'etchmiadzin', 'էջմիածին'],
  },
  {
    id: 10,
    regionId: 3,
    name: 'Մեծամոր',
    slug: 'metsamor',
    aliases: ['metsamor', 'mecamor'],
  },

  // Գեղարքունիք
  {
    id: 11,
    regionId: 4,
    name: 'Սևան',
    slug: 'sevan',
    aliases: ['sevan'],
  },
  {
    id: 12,
    regionId: 4,
    name: 'Գավառ',
    slug: 'gavar',
    aliases: ['gavar', 'kamo', 'կամո'],
  },
  {
    id: 13,
    regionId: 4,
    name: 'Մարտունի',
    slug: 'martuni',
    aliases: ['martuni'],
  },
  {
    id: 14,
    regionId: 4,
    name: 'Վարդենիս',
    slug: 'vardenis',
    aliases: ['vardenis'],
  },
  {
    id: 15,
    regionId: 4,
    name: 'Ճամբարակ',
    slug: 'chambarak',
    aliases: ['chambarak', 'jambarak'],
  },

  // Կոտայք
  {
    id: 16,
    regionId: 5,
    name: 'Հրազդան',
    slug: 'hrazdan',
    aliases: ['hrazdan', 'razdan'],
  },
  {
    id: 17,
    regionId: 5,
    name: 'Աբովյան',
    slug: 'abovyan',
    aliases: ['abovyan', 'abovian'],
  },
  {
    id: 18,
    regionId: 5,
    name: 'Չարենցավան',
    slug: 'charentsavan',
    aliases: ['charentsavan', 'charencavan'],
  },
  {
    id: 19,
    regionId: 5,
    name: 'Եղվարդ',
    slug: 'yeghvard',
    aliases: ['yeghvard', 'eghvard', 'exvard'],
  },
  {
    id: 20,
    regionId: 5,
    name: 'Բյուրեղավան',
    slug: 'byureghavan',
    aliases: ['byureghavan', 'byurexavan', 'bureghavan', 'burexavan'],
  },
  {
    id: 21,
    regionId: 5,
    name: 'Նոր Հաճն',
    slug: 'nor-hachn',
    aliases: ['nor hachn', 'nor hachin', 'nor hajin', 'nor-hajin'],
  },
  {
    id: 22,
    regionId: 5,
    name: 'Ծաղկաձոր',
    slug: 'tsaghkadzor',
    aliases: ['tsaghkadzor', 'tsaxkadzor', 'caxkadzor', 'tsakhkadzor'],
  },

  // Լոռի
  {
    id: 23,
    regionId: 6,
    name: 'Վանաձոր',
    slug: 'vanadzor',
    aliases: ['vanadzor', 'kirovakan', 'կիրովական'],
  },
  {
    id: 24,
    regionId: 6,
    name: 'Ալավերդի',
    slug: 'alaverdi',
    aliases: ['alaverdi'],
  },
  {
    id: 25,
    regionId: 6,
    name: 'Սպիտակ',
    slug: 'spitak',
    aliases: ['spitak'],
  },
  {
    id: 26,
    regionId: 6,
    name: 'Ստեփանավան',
    slug: 'stepanavan',
    aliases: ['stepanavan'],
  },
  {
    id: 27,
    regionId: 6,
    name: 'Տաշիր',
    slug: 'tashir',
    aliases: ['tashir', 'kalinino', 'կալինինո'],
  },
  {
    id: 28,
    regionId: 6,
    name: 'Ախթալա',
    slug: 'akhtala',
    aliases: ['akhtala', 'axtala'],
  },
  {
    id: 29,
    regionId: 6,
    name: 'Թումանյան',
    slug: 'tumanyan',
    aliases: ['tumanyan', 'toumanyan'],
  },

  // Շիրակ
  {
    id: 30,
    regionId: 7,
    name: 'Գյումրի',
    slug: 'gyumri',
    aliases: ['gyumri', 'giumri', 'leninakan', 'alexandropol', 'լենինական', 'ալեքսանդրապոլ'],
  },
  {
    id: 31,
    regionId: 7,
    name: 'Արթիկ',
    slug: 'artik',
    aliases: ['artik'],
  },
  {
    id: 32,
    regionId: 7,
    name: 'Մարալիկ',
    slug: 'maralik',
    aliases: ['maralik'],
  },

  // Սյունիք
  {
    id: 33,
    regionId: 8,
    name: 'Կապան',
    slug: 'kapan',
    aliases: ['kapan', 'ghapan', 'ղափան'],
  },
  {
    id: 34,
    regionId: 8,
    name: 'Գորիս',
    slug: 'goris',
    aliases: ['goris'],
  },
  {
    id: 35,
    regionId: 8,
    name: 'Սիսիան',
    slug: 'sisian',
    aliases: ['sisian'],
  },
  {
    id: 36,
    regionId: 8,
    name: 'Քաջարան',
    slug: 'kajaran',
    aliases: ['kajaran', 'qajaran'],
  },
  {
    id: 37,
    regionId: 8,
    name: 'Մեղրի',
    slug: 'meghri',
    aliases: ['meghri', 'mexri'],
  },
  {
    id: 38,
    regionId: 8,
    name: 'Ագարակ',
    slug: 'agarak',
    aliases: ['agarak'],
  },

  // Վայոց Ձոր
  {
    id: 39,
    regionId: 10,
    name: 'Եղեգնաձոր',
    slug: 'yeghegnadzor',
    aliases: ['yeghegnadzor', 'eghegnadzor', 'exegnadzor'],
  },
  {
    id: 40,
    regionId: 10,
    name: 'Վայք',
    slug: 'vayk',
    aliases: ['vayk', 'vaik'],
  },
  {
    id: 41,
    regionId: 10,
    name: 'Ջերմուկ',
    slug: 'jermuk',
    aliases: ['jermuk', 'djermuk'],
  },

  // Տավուշ
  {
    id: 42,
    regionId: 9,
    name: 'Իջևան',
    slug: 'ijevan',
    aliases: ['ijevan', 'idjevan'],
  },
  {
    id: 43,
    regionId: 9,
    name: 'Դիլիջան',
    slug: 'dilijan',
    aliases: ['dilijan', 'dilidjan'],
  },
  {
    id: 44,
    regionId: 9,
    name: 'Բերդ',
    slug: 'berd',
    aliases: ['berd', 'shamshadin', 'շամշադին'],
  },
  {
    id: 45,
    regionId: 9,
    name: 'Նոյեմբերյան',
    slug: 'noyemberyan',
    aliases: ['noyemberyan', 'noyembryan'],
  },
  {
    id: 46,
    regionId: 9,
    name: 'Այրում',
    slug: 'ayrum',
    aliases: ['ayrum', 'airum'],
  },
]
