import type { FaqItem } from '~/types/common'
import type {
  VehicleTypeGeo,
  VehicleTypePage,
  VehicleTypeSeoVocabulary,
} from '~/constants/vehicleTypePages'
import { localizedPlaceName } from './placeNames'

/**
 * The two vehicle-type landing pages, in Russian and English.
 *
 * ## Why the copy is here and not in `constants/vehicleTypePages.ts`
 *
 * That file is the Armenian source of truth — route, vehicle type, sitemap
 * membership and the words the page is built from — and the rule for this
 * whole translation pass is that the Armenian does not move. Three parallel
 * copies of a 90-line object interleaved in one file would also make the one
 * thing that must stay in sync (which slugs exist) the hardest thing to see.
 *
 * ## Why the transliterated keywords are NOT translated
 *
 * `keywordTranslit` and `shortKeywordTranslit` are not Armenian — they are
 * what people type into a Latin keyboard, and «manipulatorov evakuator» is
 * typed by Russian-speaking and English-speaking visitors in Armenia exactly
 * as it is by Armenian ones. Translating them would delete the only query
 * form these pages share across all three languages.
 *
 * ## Why the geo half is derived and not listed
 *
 * Armenian needs a hand-written locative per marz («Լոռու մարզում», not
 * «Լոռիի մարզում») — see `REGION_LOCATIVES`. Russian and English do not: the
 * marz name is not declined in «в марзе Лори» or in "in Lori region", so the
 * two forms compose from the name that `i18n/placeNames.ts` already holds.
 * Ten more hand-written strings per language would be ten more chances to be
 * wrong about nothing.
 */

/** The translatable half of a `VehicleTypePage` — everything a reader sees */
interface VehicleTypeCopy {
  navLabel: string
  heading: string
  title: string
  description: string
  seo: VehicleTypeSeoVocabulary
  faq: FaqItem[]
}

const MANIPULATOR_RU: VehicleTypeCopy = {
  navLabel: 'Манипуляторы',
  heading: 'Эвакуатор с манипулятором',
  title: 'Эвакуатор с манипулятором в Армении',
  description:
    'Эвакуаторы с краном-манипулятором в Армении — чтобы поднять машину из труднодоступного ' +
    'места. Смотрите свободных водителей и цены, звоните водителю напрямую.',
  seo: {
    keyword: 'эвакуатор с манипулятором',
    keywordTranslit: 'manipulatorov evakuator',
    shortKeyword: 'манипулятор',
    shortKeywordTranslit: 'manipulator',
    extraKeywords: [
      'эвакуатор с краном',
      'кран-манипулятор',
      'автокран',
      'аренда манипулятора',
      'услуги манипулятора',
      'krunkov evakuator',
      'manipulator vardzov',
      'avtokrunk',
    ],
    serviceSummary:
      'Услуга эвакуатора с краном-манипулятором: вертикальный подъём и перевозка автомобиля или ' +
      'груза оттуда, куда обычная платформа подъехать не может.',
    metaTeaser: 'Подъём краном из труднодоступных мест.',
    explainer:
      'Эвакуатор с манипулятором — это грузовик с краном: машину поднимают вертикально, без ' +
      'буксировки. Обычный эвакуатор затягивает автомобиль на платформу, а манипулятор берёт его ' +
      'сверху — даже там, куда сам грузовик подъехать не может.',
    whenNeeded:
      'Кран нужен, когда машина съехала в овраг или в яму, стоит в узком дворе, на подземной ' +
      'парковке или между двумя автомобилями, а также когда надо перевезти тяжёлый предмет, ' +
      'строительную технику, контейнер или генератор.',
  },
  faq: [
    {
      question: 'Что такое эвакуатор с манипулятором',
      answer:
        'Эвакуатор с манипулятором (manipulatorov evakuator) — это грузовик с краном, которым ' +
        'машину поднимают вертикально, без буксировки. Обычный эвакуатор затягивает автомобиль ' +
        'на платформу, а манипулятор берёт его сверху — даже там, куда грузовик подъехать не может.',
    },
    {
      question: 'Когда нужен эвакуатор с манипулятором',
      answer:
        'Когда машину невозможно затянуть на платформу: она съехала в овраг или в яму, стоит в ' +
        'узком дворе, на подземной парковке или между двумя автомобилями. А также когда надо ' +
        'перевезти тяжёлый предмет, строительную технику или контейнер.',
    },
    {
      question: 'Сколько стоит услуга манипулятора',
      answer:
        'Цена зависит от расстояния, веса машины, сложности работы и времени суток. На карточке ' +
        'каждого водителя указана начальная цена; точную стоимость уточните при звонке — напрямую, ' +
        'без посредников.',
    },
    {
      question: 'Можно ли вызвать манипулятор ночью',
      answer:
        'Да. Часть водителей работает круглосуточно, 24/7. На каждой карточке указаны рабочие ' +
        'часы, а у круглосуточных водителей стоит отметка 24/7.',
    },
    {
      question: 'Работают ли по всей Армении',
      answer:
        'На этой странице собраны манипуляторы из всех марзов. На карточке каждого водителя ' +
        'указаны его основное местоположение и обслуживаемые районы — Ереван, Гюмри, Ванадзор и ' +
        'другие города.',
    },
  ],
}

const MANIPULATOR_EN: VehicleTypeCopy = {
  navLabel: 'Crane trucks',
  heading: 'Crane tow truck',
  title: 'Crane tow truck (manipulator) in Armenia',
  description:
    'Crane tow trucks in Armenia, for lifting a car out of a place a flatbed cannot reach. ' +
    'See the available drivers and their prices, and call the driver directly.',
  seo: {
    keyword: 'crane tow truck',
    keywordTranslit: 'manipulatorov evakuator',
    shortKeyword: 'manipulator',
    shortKeywordTranslit: 'manipulator',
    extraKeywords: [
      'crane truck Armenia',
      'truck mounted crane',
      'boom truck',
      'manipulator truck hire',
      'vehicle lifting service',
      'krunkov evakuator',
      'manipulator vardzov',
      'avtokrunk',
    ],
    serviceSummary:
      'A tow truck with a mounted crane: it lifts a car or a load straight up and carries it out ' +
      'of places an ordinary flatbed cannot reach.',
    metaTeaser: 'Crane lifting from hard-to-reach places.',
    explainer:
      'A crane tow truck — a manipulator — is a lorry with a crane on it: the car is lifted ' +
      'vertically rather than towed. An ordinary flatbed pulls the car up onto its platform, ' +
      'while a crane can pick it up from above, even where the truck itself cannot get close.',
    whenNeeded:
      'You need a crane when the car has gone off into a ditch or a hole, is parked in a narrow ' +
      'courtyard, in an underground car park or wedged between two other cars — and whenever ' +
      'something heavy has to be moved: construction equipment, a container or a generator.',
  },
  faq: [
    {
      question: 'What is a crane tow truck?',
      answer:
        'A crane tow truck — locally a manipulator (manipulatorov evakuator) — is a lorry with a ' +
        'crane on it. The car is lifted vertically instead of being towed, so it can be taken out ' +
        'of places an ordinary flatbed cannot reach.',
    },
    {
      question: 'When do I need one?',
      answer:
        'When the car cannot be pulled onto a platform: it has gone into a ditch or a hole, it is ' +
        'in a narrow courtyard, in an underground car park, or wedged between two other cars. ' +
        'Also when something heavy has to be moved — construction equipment or a container.',
    },
    {
      question: 'How much does it cost?',
      answer:
        'The price depends on the distance, the weight of the vehicle, how difficult the lift is ' +
        'and the time of day. Every driver card shows a starting price; confirm the exact figure ' +
        'on the call — directly with the driver, with no agency in between.',
    },
    {
      question: 'Can I call one at night?',
      answer:
        'Yes. Some drivers work around the clock, 24/7. Each card shows the working hours, and ' +
        'the round-the-clock drivers are marked 24/7.',
    },
    {
      question: 'Do they work across the whole country?',
      answer:
        'This page collects the crane trucks from every region. Each card shows the driver’s home ' +
        'base and the areas they cover — Yerevan, Gyumri, Vanadzor and the other cities.',
    },
  ],
}

const HEAVY_DUTY_RU: VehicleTypeCopy = {
  navLabel: 'Тяжёлая техника',
  heading: 'Эвакуатор для тяжёлой техники',
  title: 'Эвакуатор для тяжёлой техники в Армении',
  description:
    'Эвакуация грузовиков, автобусов и тяжёлой техники в Армении. Найдите водителя с нужной ' +
    'грузоподъёмностью и позвоните напрямую.',
  seo: {
    keyword: 'эвакуатор для тяжёлой техники',
    keywordTranslit: 'tsanr tehnikayi evakuator',
    shortKeyword: 'тяжёлая техника',
    shortKeywordTranslit: 'tsanr tehnika',
    extraKeywords: [
      'эвакуатор грузовиков',
      'эвакуатор автобусов',
      'большой эвакуатор',
      'перевозка тяжёлой техники',
      'перевозка спецтехники',
      'trailer evakuator',
      'bernatari evakuator',
      'mec evakuator',
    ],
    serviceSummary:
      'Услуга эвакуатора большой грузоподъёмности: перевозка грузовиков, автобусов, ' +
      'микроавтобусов и строительной техники.',
    metaTeaser: 'Перевозка грузовиков, автобусов и спецтехники.',
    explainer:
      'Эвакуатор для тяжёлой техники — это машина с большой грузоподъёмностью и длинной ' +
      'платформой. Грузоподъёмности обычного легкового эвакуатора для такой работы не хватает, ' +
      'поэтому заранее уточняйте не только вес, но и длину и ширину техники.',
    whenNeeded:
      'Такой эвакуатор нужен для перевозки грузовика, автобуса, микроавтобуса, экскаватора, ' +
      'бульдозера, автопогрузчика или другой строительной техники — как после аварии, так и при ' +
      'плановом перемещении с объекта на объект.',
  },
  faq: [
    {
      question: 'Что такое эвакуатор для тяжёлой техники',
      answer:
        'Эвакуатор для тяжёлой техники (tsanr tehnikayi evakuator) — это машина большой ' +
        'грузоподъёмности для перевозки грузовиков, автобусов, микроавтобусов и строительной ' +
        'техники. Грузоподъёмности обычного легкового эвакуатора для такой работы не хватает.',
    },
    {
      question: 'Технику какого веса перевозят',
      answer:
        'На карточке каждого водителя указана максимальная грузоподъёмность в тоннах. Выберите ' +
        'подходящую вашему весу и уточните при звонке — важны также длина и ширина техники.',
    },
    {
      question: 'Могут ли поднять строительную технику',
      answer:
        'Если технику нужно поднять, а не затянуть на платформу, вам нужен эвакуатор с краном — ' +
        'смотрите страницу «Эвакуатор с манипулятором». У многих водителей есть и большая ' +
        'платформа, и манипулятор.',
    },
    {
      question: 'Сколько стоит эвакуация тяжёлой техники',
      answer:
        'Цена зависит от веса техники, расстояния и сложности работы. На карточке указана ' +
        'начальная цена; точную стоимость уточните напрямую у водителя, без посредников.',
    },
    {
      question: 'Делают ли межмарзовые перевозки',
      answer:
        'Да. На каждой карточке указаны обслуживаемые районы водителя. Для дальних направлений ' +
        'смотрите также раздел «Свободные маршруты»: там водители объявляют уже запланированные ' +
        'рейсы, и это обычно дешевле.',
    },
  ],
}

const HEAVY_DUTY_EN: VehicleTypeCopy = {
  navLabel: 'Heavy vehicles',
  heading: 'Heavy-duty tow truck',
  title: 'Heavy-duty tow truck in Armenia',
  description:
    'Recovery of lorries, buses and heavy machinery in Armenia. Find a driver with the payload ' +
    'you need and call them directly.',
  seo: {
    keyword: 'heavy-duty tow truck',
    keywordTranslit: 'tsanr tehnikayi evakuator',
    shortKeyword: 'heavy machinery',
    shortKeywordTranslit: 'tsanr tehnika',
    extraKeywords: [
      'lorry recovery Armenia',
      'bus towing',
      'large tow truck',
      'heavy machinery transport',
      'construction equipment transport',
      'trailer evakuator',
      'bernatari evakuator',
      'mec evakuator',
    ],
    serviceSummary:
      'A high-payload tow truck service for moving lorries, buses, minibuses and construction ' +
      'machinery.',
    metaTeaser: 'Lorries, buses and construction machinery moved.',
    explainer:
      'A heavy-duty tow truck has a high payload and a long platform. An ordinary car carrier ' +
      'cannot take this kind of load, so check not only the weight in advance but the length and ' +
      'width of the machine as well.',
    whenNeeded:
      'This is the truck for a lorry, a bus, a minibus, an excavator, a bulldozer, a forklift or ' +
      'any other piece of construction machinery — after a breakdown, and equally for a planned ' +
      'move from one site to the next.',
  },
  faq: [
    {
      question: 'What is a heavy-duty tow truck?',
      answer:
        'A heavy-duty tow truck (tsanr tehnikayi evakuator) is a high-payload vehicle for moving ' +
        'lorries, buses, minibuses and construction machinery. An ordinary car carrier does not ' +
        'have the payload for that kind of work.',
    },
    {
      question: 'How heavy a load can they take?',
      answer:
        'Each driver card states the maximum payload in tonnes. Pick one that matches your ' +
        'weight and confirm on the call — the length and width of the machine matter too.',
    },
    {
      question: 'Can they lift construction machinery?',
      answer:
        'If the machine has to be lifted rather than pulled onto a platform, you need a crane ' +
        'truck — see the "Crane tow truck" page. Many drivers have both a long platform and a crane.',
    },
    {
      question: 'How much does it cost?',
      answer:
        'The price depends on the weight, the distance and how difficult the job is. The card ' +
        'shows a starting price; confirm the exact figure directly with the driver, with no ' +
        'agency in between.',
    },
    {
      question: 'Do they drive between regions?',
      answer:
        'Yes. Every card lists the areas a driver covers. For long routes see the "Free routes" ' +
        'section as well: drivers post trips they have already planned there, which is usually ' +
        'cheaper.',
    },
  ],
}

const COPY: Record<string, Record<string, VehicleTypeCopy>> = {
  ru: { manipulator: MANIPULATOR_RU, 'tsanr-tehnika': HEAVY_DUTY_RU },
  en: { manipulator: MANIPULATOR_EN, 'tsanr-tehnika': HEAVY_DUTY_EN },
}

/**
 * The page as it should read in `locale`.
 *
 * Returns the Armenian object itself for `hy` and for anything unknown, so a
 * caller can localise unconditionally and a locale that has no copy degrades
 * to the source language rather than to an empty page.
 */
export function localizedVehicleTypePage(page: VehicleTypePage, locale: string): VehicleTypePage {
  const copy = COPY[locale]?.[page.slug]
  return copy ? { ...page, ...copy } : page
}

/** «Հայաստանում» / «в Армении» / "in Armenia" — the country-wide locative */
export function countryLocative(locale: string): string {
  if (locale === 'ru') return 'в Армении'
  if (locale === 'en') return 'in Armenia'
  return 'Հայաստանում'
}

/** «Հայաստան» / «Армения» / "Armenia" — the bare country name */
export function countryName(locale: string): string {
  if (locale === 'ru') return 'Армения'
  if (locale === 'en') return 'Armenia'
  return 'Հայաստան'
}

/**
 * The area as it should read in `locale` — its name and its locative.
 *
 * Yerevan is a city and takes no «մարզ»/«марз»/"region" in any of the three,
 * which is the one branch here; everything else is the marz pattern each
 * language already uses on the geography pages (`buildRegionSeo`).
 */
export function localizedVehicleTypeGeo(geo: VehicleTypeGeo, locale: string): VehicleTypeGeo {
  if (locale !== 'ru' && locale !== 'en') return geo

  const name = localizedPlaceName(geo.isYerevan ? 'city' : 'region', geo.slug, geo.name, locale)

  if (geo.isYerevan) {
    // Spelled out rather than suffixed: «в Ереване» is the prepositional case
    // of one specific name, and a rule that appends «е» to a translated name
    // would be wrong the moment a second city page exists.
    return { ...geo, name, locative: locale === 'ru' ? 'в Ереване' : `in ${name}` }
  }

  return {
    ...geo,
    name,
    locative: locale === 'ru' ? `в марзе ${name}` : `in ${name} region`,
  }
}
