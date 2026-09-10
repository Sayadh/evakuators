/**
 * Armenian place names in Russian and English.
 *
 * ## Why a separate map instead of `nameRu` on each row
 *
 * `data/*.ts` is the Armenian source of truth and stays exactly as it is — the
 * names, the ids, the aliases, the order. Adding two more fields to 81 rows
 * would put translations in the one place nobody looks for them, mixed into
 * data that is also the input to slug validation, coverage limits and the
 * search index. Here they sit with the rest of the translations, and a name
 * that is missing is missing in one obvious file.
 *
 * ## Why not derive them from the slug
 *
 * The slug is already a Latin transliteration, so `ashtarak` → "Ashtarak" looks
 * like a free English name. It is not: `vayots-dzor` is "Vayots Dzor" and
 * `kanaker-zeytun` is "Kanaker-Zeytun", and no rule can tell which hyphen is a
 * word break and which is part of the name. Russian is further still —
 * `vagharshapat` is «Эчмиадзин» to most people who would search for it, which
 * is not a transliteration of anything.
 *
 * ## Keyed by type AND slug
 *
 * Slugs are unique within a type, not across them: `ararat` and `armavir` are
 * each both a marz and a town. One flat map would silently give a town its
 * region's name.
 *
 * ## What this does NOT translate
 *
 * The ~300 settlements in `data/settlement.ts`. They are villages nobody
 * searches for in Russian or English, and 300 hand-written names would be 300
 * chances for a wrong one. They keep their Armenian name in every language,
 * which is also what a road sign there says.
 */

export type PlaceKind = 'region' | 'city' | 'district' | 'zone'

type NameMap = Record<PlaceKind, Record<string, string>>

const RU: NameMap = {
  region: {
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
  },
  city: {
    ashtarak: 'Аштарак',
    aparan: 'Апаран',
    talin: 'Талин',
    ararat: 'Арарат',
    artashat: 'Арташат',
    masis: 'Масис',
    vedi: 'Веди',
    armavir: 'Армавир',
    // The name almost everyone searching in Russian uses. The town was renamed
    // Вагаршапат officially; «Эчмиадзин» is what is typed.
    vagharshapat: 'Эчмиадзин',
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
    'nor-hachn': 'Нор-Ачн',
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
    yeghegnadzor: 'Егегнадзор',
    vayk: 'Вайк',
    jermuk: 'Джермук',
    ijevan: 'Иджеван',
    dilijan: 'Дилижан',
    berd: 'Берд',
    noyemberyan: 'Ноемберян',
    ayrum: 'Айрум',
  },
  district: {
    ajapnyak: 'Аджапняк',
    arabkir: 'Арабкир',
    avan: 'Аван',
    davtashen: 'Давташен',
    erebuni: 'Эребуни',
    kentron: 'Кентрон',
    'malatia-sebastia': 'Малатия-Себастия',
    'nor-nork': 'Нор-Норк',
    'nork-marash': 'Норк-Мараш',
    nubarashen: 'Нубарашен',
    shengavit: 'Шенгавит',
    'kanaker-zeytun': 'Канакер-Зейтун',
  },
  zone: {
    'byurakan-amberd': 'Бюракан–Амберд',
    'aragats-tsaghkahovit': 'Арагац–Цахкаовит',
    yeraskh: 'Ераcх',
    'vardenik-tsakkar': 'Варденик–Цаккар',
    'garni-geghard': 'Гарни–Гегард',
    'bjni-arzakan': 'Бжни–Арзакан',
    'odzun-haghpat': 'Одзун–Ахпат',
    'tatev-halidzor': 'Татев–Алидзор',
    'khndzoresk-kornidzor': 'Хндзореск–Корнидзор',
    yenokavan: 'Енокаван',
    'gosh-haghartsin': 'Гош–Агарцин',
    'areni-noravank': 'Арени–Нораванк',
  },
}

const EN: NameMap = {
  region: {
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
  },
  city: {
    ashtarak: 'Ashtarak',
    aparan: 'Aparan',
    talin: 'Talin',
    ararat: 'Ararat',
    artashat: 'Artashat',
    masis: 'Masis',
    vedi: 'Vedi',
    armavir: 'Armavir',
    vagharshapat: 'Vagharshapat (Etchmiadzin)',
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
  },
  district: {
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
  },
  zone: {
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
  },
}

const BY_LOCALE: Record<string, NameMap> = { ru: RU, en: EN }

/** Yerevan is a pseudo-region and has no row in `staticRegions` — see geography.ts */
const YEREVAN: Record<string, string> = { ru: 'Ереван', en: 'Yerevan' }

/**
 * The name to SHOW for a place, in the language being rendered.
 *
 * Falls back to the Armenian name it was given: an unknown slug, a settlement,
 * or a locale with no map is a name that renders in Armenian rather than a
 * blank or a slug. On a page whose job is to be understood, a word in the wrong
 * alphabet is still better than `nor-hachn`.
 */
export function localizedPlaceName(
  kind: PlaceKind,
  slug: string,
  armenianName: string,
  locale: string,
): string {
  if (slug === 'yerevan') return YEREVAN[locale] ?? armenianName
  return BY_LOCALE[locale]?.[kind]?.[slug] ?? armenianName
}

/** Every slug this file has a translation for, for the parity test */
export function translatedSlugs(locale: 'ru' | 'en', kind: PlaceKind): string[] {
  return Object.keys(BY_LOCALE[locale][kind])
}
