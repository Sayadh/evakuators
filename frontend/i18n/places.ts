/**
 * Russian and English names for Armenia's geography.
 *
 * ## Why a separate map instead of `nameRu` on each row
 *
 * `data/regions.ts`, `data/cities.ts` and their siblings are the taxonomy —
 * the ids, slugs and relationships everything else is matched against. A
 * translation is content, and the moment it lives in those files every edit to
 * the wording touches the file that defines what a place IS. Keeping the two
 * apart also means a missing translation is one lookup away from being caught
 * (`tests/placeNames.spec.ts`) rather than an optional field nobody notices is
 * unset.
 *
 * ## Keyed by slug, flat across kinds
 *
 * A slug is unique within its kind but not across them — «Արարատ» is a marz, a
 * town AND a village. They are the same word in every language, so one flat map
 * is the honest shape: the day two places sharing a slug need different
 * translations is the day this becomes two maps, and it has not come.
 *
 * ## Settlements are deliberately absent
 *
 * The ~300 villages keep their Armenian names in every language. They are what
 * a caller says on the phone, not what anyone types into Google in Russian, and
 * `toSearchKey` already matches them typed in Latin or Cyrillic
 * (`utils/transliteration.ts`) — so nothing is unfindable. Translating them
 * would be 300 hand-checked names for no traffic.
 *
 * ## The spellings themselves
 *
 * Russian uses the forms in ordinary Russian-language use for Armenia — the
 * ones an advertiser bids on and a reader recognises («Ереван», «Гюмри»,
 * «Эчмиадзин» is NOT here because the town's own name is Վաղարշապատ and the
 * site says Вагаршапат). English uses the standard romanisation the country
 * itself publishes, which is also what a map application shows.
 */

/** The languages that need a translated name; Armenian is the source */
type TranslatedLocale = 'ru' | 'en'

const RU: Record<string, string> = {
  // The capital — a pseudo-region, so it is not in any of the lists below.
  yerevan: 'Ереван',

  // Marzes
  aragatsotn: 'Арагацотн',
  ararat: 'Арарат',
  armavir: 'Армавир',
  gegharkunik: 'Гегаркуник',
  kotayk: 'Котайк',
  lori: 'Лори',
  shirak: 'Ширак',
  syunik: 'Сюник',
  tavush: 'Тавуш',
  'vayots-dzor': 'Вайоц-Дзор',

  // Yerevan's districts
  ajapnyak: 'Аджапняк',
  arabkir: 'Арабкир',
  avan: 'Аван',
  davtashen: 'Давташен',
  erebuni: 'Эребуни',
  kentron: 'Кентрон',
  'malatia-sebastia': 'Малатия-Себастия',
  'nor-nork': 'Нор Норк',
  'nork-marash': 'Норк-Мараш',
  nubarashen: 'Нубарашен',
  shengavit: 'Шенгавит',
  'kanaker-zeytun': 'Канакер-Зейтун',

  // Towns
  ashtarak: 'Аштарак',
  aparan: 'Апаран',
  talin: 'Талин',
  artashat: 'Арташат',
  masis: 'Масис',
  vedi: 'Веди',
  vagharshapat: 'Вагаршапат',
  metsamor: 'Мецамор',
  sevan: 'Севан',
  gavar: 'Гавар',
  martuni: 'Мартуни',
  vardenis: 'Варденис',
  chambarak: 'Чамбарак',
  hrazdan: 'Раздан',
  abovyan: 'Абовян',
  charentsavan: 'Чаренцаван',
  yeghvard: 'Егвард',
  byureghavan: 'Бюрегаван',
  'nor-hachn': 'Нор Ачин',
  tsaghkadzor: 'Цахкадзор',
  vanadzor: 'Ванадзор',
  alaverdi: 'Алаверди',
  spitak: 'Спитак',
  stepanavan: 'Степанаван',
  tashir: 'Ташир',
  akhtala: 'Ахтала',
  tumanyan: 'Туманян',
  gyumri: 'Гюмри',
  artik: 'Артик',
  maralik: 'Маралик',
  kapan: 'Капан',
  goris: 'Горис',
  sisian: 'Сисиан',
  kajaran: 'Каджаран',
  meghri: 'Мегри',
  agarak: 'Агарак',
  yeghegnadzor: 'Ехегнадзор',
  vayk: 'Вайк',
  jermuk: 'Джермук',
  ijevan: 'Иджеван',
  dilijan: 'Дилижан',
  berd: 'Берд',
  noyemberyan: 'Ноемберян',
  ayrum: 'Айрум',

  // Road corridors — an en dash between the two ends, as in the Armenian
  'byurakan-amberd': 'Бюракан–Амберд',
  'aragats-tsaghkahovit': 'Арагац–Цахкаовит',
  yeraskh: 'Ераскх',
  'vardenik-tsakkar': 'Варденик–Цаккар',
  'garni-geghard': 'Гарни–Гегард',
  'bjni-arzakan': 'Бжни–Арзакан',
  'odzun-haghpat': 'Одзун–Ахпат',
  'tatev-halidzor': 'Татев–Алидзор',
  'khndzoresk-kornidzor': 'Хндзореск–Корнидзор',
  yenokavan: 'Енокаван',
  'gosh-haghartsin': 'Гош–Агарцин',
  'areni-noravank': 'Арени–Нораванк',
}

const EN: Record<string, string> = {
  yerevan: 'Yerevan',

  aragatsotn: 'Aragatsotn',
  ararat: 'Ararat',
  armavir: 'Armavir',
  gegharkunik: 'Gegharkunik',
  kotayk: 'Kotayk',
  lori: 'Lori',
  shirak: 'Shirak',
  syunik: 'Syunik',
  tavush: 'Tavush',
  'vayots-dzor': 'Vayots Dzor',

  ajapnyak: 'Ajapnyak',
  arabkir: 'Arabkir',
  avan: 'Avan',
  davtashen: 'Davtashen',
  erebuni: 'Erebuni',
  kentron: 'Kentron',
  'malatia-sebastia': 'Malatia-Sebastia',
  'nor-nork': 'Nor Nork',
  'nork-marash': 'Nork-Marash',
  nubarashen: 'Nubarashen',
  shengavit: 'Shengavit',
  'kanaker-zeytun': 'Kanaker-Zeytun',

  ashtarak: 'Ashtarak',
  aparan: 'Aparan',
  talin: 'Talin',
  artashat: 'Artashat',
  masis: 'Masis',
  vedi: 'Vedi',
  vagharshapat: 'Vagharshapat',
  metsamor: 'Metsamor',
  sevan: 'Sevan',
  gavar: 'Gavar',
  martuni: 'Martuni',
  vardenis: 'Vardenis',
  chambarak: 'Chambarak',
  hrazdan: 'Hrazdan',
  abovyan: 'Abovyan',
  charentsavan: 'Charentsavan',
  yeghvard: 'Yeghvard',
  byureghavan: 'Byureghavan',
  'nor-hachn': 'Nor Hachn',
  tsaghkadzor: 'Tsaghkadzor',
  vanadzor: 'Vanadzor',
  alaverdi: 'Alaverdi',
  spitak: 'Spitak',
  stepanavan: 'Stepanavan',
  tashir: 'Tashir',
  akhtala: 'Akhtala',
  tumanyan: 'Tumanyan',
  gyumri: 'Gyumri',
  artik: 'Artik',
  maralik: 'Maralik',
  kapan: 'Kapan',
  goris: 'Goris',
  sisian: 'Sisian',
  kajaran: 'Kajaran',
  meghri: 'Meghri',
  agarak: 'Agarak',
  yeghegnadzor: 'Yeghegnadzor',
  vayk: 'Vayk',
  jermuk: 'Jermuk',
  ijevan: 'Ijevan',
  dilijan: 'Dilijan',
  berd: 'Berd',
  noyemberyan: 'Noyemberyan',
  ayrum: 'Ayrum',

  'byurakan-amberd': 'Byurakan–Amberd',
  'aragats-tsaghkahovit': 'Aragats–Tsaghkahovit',
  yeraskh: 'Yeraskh',
  'vardenik-tsakkar': 'Vardenik–Tsakkar',
  'garni-geghard': 'Garni–Geghard',
  'bjni-arzakan': 'Bjni–Arzakan',
  'odzun-haghpat': 'Odzun–Haghpat',
  'tatev-halidzor': 'Tatev–Halidzor',
  'khndzoresk-kornidzor': 'Khndzoresk–Kornidzor',
  yenokavan: 'Yenokavan',
  'gosh-haghartsin': 'Gosh–Haghartsin',
  'areni-noravank': 'Areni–Noravank',
}

export const PLACE_NAMES: Record<TranslatedLocale, Record<string, string>> = { ru: RU, en: EN }

/**
 * A place's name in `locale`, falling back to the Armenian one it was given.
 *
 * The fallback is the point, not a safety net. Settlements are not in the map
 * on purpose, and a village rendering as «Պտղնի» on the Russian page is the
 * intended result — the alternative is a blank where a place name belongs.
 */
export function placeNameIn(locale: string, slug: string, armenian: string): string {
  if (locale === 'ru' || locale === 'en') return PLACE_NAMES[locale][slug] ?? armenian
  return armenian
}
