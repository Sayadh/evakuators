import { SITE_NAME, SITE_TAGLINE } from '~/constants/site'
import { localizedPlaceName, type PlaceKind } from '~/i18n/placeNames'
import { formatPrice, formatStartingPrice } from '~/utils/formatPrice'

/**
 * SEO keyword strategy.
 *
 * People search both in Armenian script («էվակուատոր երևան») and in
 * transliterated Latin («evakuator erevan», «evakuator 24 jam», «ejan evakuator»).
 * Every location page therefore carries BOTH variants in its title,
 * description, keywords meta and visible SEO text.
 */

/**
 * The Latin half of every list is identical in all three languages, and that
 * is the point: «evakuator 24 jam» is typed by Russian- and English-speaking
 * residents of Armenia exactly as it is by Armenian ones. Only the half in the
 * page's own script changes.
 */
const BASE_KEYWORDS: Record<string, string[]> = {
  hy: [
    'էվակուատոր',
    'էժան էվակուատոր',
    'գիշերային էվակուատոր',
    '24/7 էվակուատոր',
    '24 ժամ էվակուատոր',
    'մանիպուլյատորով էվակուատոր',
    'նոր էվակուատոր',
    'evakuator',
    'evakuator 24 jam',
    'gisherayin evakuator',
    'ejan evakuator',
    'manipulatorov evakuator',
    'evakuator hayastan',
  ],
  ru: [
    'эвакуатор',
    'дешёвый эвакуатор',
    'ночной эвакуатор',
    'эвакуатор 24/7',
    'эвакуатор круглосуточно',
    'эвакуатор с манипулятором',
    'эвакуатор Армения',
    'evakuator',
    'evakuator 24 jam',
    'gisherayin evakuator',
    'ejan evakuator',
    'manipulatorov evakuator',
    'evakuator hayastan',
  ],
  en: [
    'tow truck',
    'cheap tow truck',
    'night tow truck',
    '24/7 tow truck',
    'tow truck around the clock',
    'crane tow truck',
    'tow truck Armenia',
    'evakuator',
    'evakuator 24 jam',
    'gisherayin evakuator',
    'ejan evakuator',
    'manipulatorov evakuator',
    'evakuator hayastan',
  ],
}

/** The base list for a locale, falling back to Armenian for anything unknown */
function baseKeywords(locale: string): string[] {
  return BASE_KEYWORDS[locale] ?? BASE_KEYWORDS.hy
}

/** "nor-hachn" → "nor hachn" — matches how people type transliterated queries */
export function translitFromSlug(slug: string): string {
  return slug.replace(/-/g, ' ')
}

export interface LocationSeo {
  title: string
  description: string
  keywords: string
}

/**
 * City / Yerevan district pages — the main SEO landing pages.
 *
 * ## Why the Russian title says «Эвакуатор Ереван» and not «в Ереване»
 *
 * Two reasons, and they point the same way. It is what people type: a search
 * is «эвакуатор ереван», in the nominative, and a title that matches the query
 * word for word is the one that gets the click. And it is what avoids getting
 * the grammar wrong: «в» takes the prepositional case, which declines
 * differently for every name — Абовян → Абовяне, Гюмри → Гюмри, Ванадзор →
 * Ванадзоре — and 46 hand-declined forms would be 46 chances to print
 * something that reads as machine-translated.
 *
 * Where the body text does need a preposition it uses «в городе X», which is
 * grammatical with the nominative and correct for every name.
 */
export function buildLocationSeo(
  nameHy: string,
  slug: string,
  locale = 'hy',
  kind: PlaceKind = 'city',
): LocationSeo {
  const translit = translitFromSlug(slug)
  const name = localizedPlaceName(kind, slug, nameHy, locale)

  if (locale === 'ru') {
    // «в городе X» is only true for a town — a Yerevan district is not a city
    // in its own right, and calling it one is the kind of small factual slip
    // that a meta description should not make. «в районе X» sidesteps
    // declining the name, the same way the classifier noun does everywhere
    // else in this file.
    const where = kind === 'district' ? `в районе ${name}` : `в городе ${name}`
    return {
      title: `Эвакуатор ${name} · Evakuator ${translit} · 24/7 | ${SITE_NAME}`,
      description: `Эвакуатор ${where} (evakuator ${translit}) круглосуточно. Недорогой эвакуатор, ночные вызовы, перевозка аварийных и неисправных машин. Реальные фотографии, цены, прямая связь с водителем.`,
      keywords: [...baseKeywords(locale), `эвакуатор ${name}`, `evakuator ${translit}`].join(', '),
    }
  }

  if (locale === 'en') {
    const where = kind === 'district' ? `the ${name} district` : name
    return {
      title: `Tow truck in ${name} · Evakuator ${translit} · 24/7 | ${SITE_NAME}`,
      description: `Tow truck in ${where} (evakuator ${translit}), around the clock. Affordable rates, night call-outs, transport of damaged and non-running vehicles. Real photos, prices, and the driver's own number.`,
      keywords: [...baseKeywords(locale), `tow truck ${name}`, `evakuator ${translit}`].join(', '),
    }
  }

  return {
    title: `Էվակուատոր ${nameHy}ում · Evakuator ${translit} · 24/7 | ${SITE_NAME}`,
    description: `Էվակուատոր ${nameHy}ում (evakuator ${translit}) 24/7 ռեժիմով։ Էժան էվակուատոր, գիշերային ծառայություն, վթարված և չաշխատող մեքենաների տեղափոխում։ Իրական նկարներ, գներ, ուղիղ կապ վարորդի հետ։`,
    keywords: [
      ...baseKeywords(locale),
      `էվակուատոր ${nameHy}`,
      `evakuator ${translit}`,
      `evakuator ${translit} 24 jam`,
      `ejan evakuator ${translit}`,
    ].join(', '),
  }
}

/** «43 վարորդ» / «43 водителя» / «43 drivers» */
export function driverCount(count: number, locale: string): string {
  if (locale === 'ru') {
    const lastTwo = count % 100
    const last = count % 10
    const word =
      lastTwo >= 11 && lastTwo <= 14
        ? 'водителей'
        : last === 1
          ? 'водитель'
          : last >= 2 && last <= 4
            ? 'водителя'
            : 'водителей'
    return `${count} ${word}`
  }
  if (locale === 'en') return `${count} ${count === 1 ? 'driver' : 'drivers'}`
  return `${count} վարորդ`
}

/**
 * The `/yerevan` title: the count and the lowest listed price, the two facts a
 * person comparing search results wants. The Latin «Evakuator erevan» stays
 * because that spelling is how most of this page's searches are typed.
 *
 * Returns `null` until there is a real count; the caller keeps the regular
 * location title. A missing price only drops the price.
 */
export function buildYerevanListingTitle(
  prices: readonly (number | null | undefined)[],
  locale = 'hy',
): string | null {
  const count = prices.length
  if (count === 0) return null

  const listed = prices.filter((price): price is number => typeof price === 'number' && price > 0)
  const facts = [
    driverCount(count, locale),
    ...(listed.length > 0 ? [localizedFromPrice(Math.min(...listed), locale)] : []),
  ].join(', ')

  if (locale === 'ru') return `Эвакуатор Ереван · Evakuator erevan 24/7 — ${facts}`
  if (locale === 'en') return `Tow truck in Yerevan · Evakuator erevan 24/7 — ${facts}`
  return `Էվակուատոր Երևանում · Evakuator erevan 24/7 — ${facts}`
}

/** «5 000 ֏-ից» reads naturally in Armenian; the others put the word first. */
export function localizedFromPrice(amount: number, locale: string): string {
  return locale === 'hy' ? `${formatPrice(amount)}-ից` : formatStartingPrice(amount, locale)
}

/** The facts the `/yerevan` title, description and FAQ quote, read from one listing */
export interface YerevanListingStats {
  count: number
  /** Lowest positive starting price, or null when no driver listed one */
  lowestPrice: number | null
  /** Drivers marked 24/7 */
  works24: number
}

export function summarizeYerevanListing(
  trucks: readonly { startingPrice?: number | null; works24Hours: boolean }[],
): YerevanListingStats {
  const prices = trucks
    .map((truck) => truck.startingPrice)
    .filter((price): price is number => typeof price === 'number' && price > 0)
  return {
    count: trucks.length,
    lowestPrice: prices.length > 0 ? Math.min(...prices) : null,
    works24: trucks.filter((truck) => truck.works24Hours).length,
  }
}

/**
 * The `/yerevan` meta description, built from the same listing as the title.
 * The Russian one leads with «вызвать … круглосуточно», the phrasing Russian
 * searches for this page use. Returns `null` without drivers, so the caller
 * keeps the regular location description.
 */
export function buildYerevanListingDescription(
  stats: YerevanListingStats,
  locale = 'hy',
): string | null {
  if (stats.count === 0) return null
  const drivers = driverCount(stats.count, locale)
  const price = stats.lowestPrice === null ? null : localizedFromPrice(stats.lowestPrice, locale)

  if (locale === 'ru') {
    return (
      `Вызвать эвакуатор в Ереване круглосуточно: ${drivers} во всех 12 районах` +
      `${price ? `, цены ${price}` : ''}. Реальные фото и цены — звоните водителю напрямую.`
    )
  }
  if (locale === 'en') {
    return (
      `Call a tow truck in Yerevan 24/7: ${drivers} across all 12 districts` +
      `${price ? `, prices ${price}` : ''}. Real photos and prices — call the driver directly.`
    )
  }
  return (
    `Էվակուատոր Երևանում 24/7. ${drivers} բոլոր 12 վարչական շրջաններում` +
    `${price ? `, գները՝ ${price}` : ''}։ Իրական նկարներ և գներ, զանգեք վարորդին ուղիղ։`
  )
}

export function buildRegionSeo(regionNameHy: string, slug: string, locale = 'hy'): LocationSeo {
  const translit = translitFromSlug(slug)
  const name = localizedPlaceName('region', slug, regionNameHy, locale)

  if (locale === 'ru') {
    return {
      title: `Эвакуатор ${name} · Evakuator ${translit} · 24/7 | ${SITE_NAME}`,
      description: `Эвакуатор в марзе ${name} (evakuator ${translit}) круглосуточно. Все эвакуаторы марза, цены и фотографии — позвоните водителю напрямую.`,
      keywords: [...baseKeywords(locale), `эвакуатор ${name}`, `evakuator ${translit}`].join(', '),
    }
  }

  if (locale === 'en') {
    return {
      title: `Tow truck in ${name} · Evakuator ${translit} · 24/7 | ${SITE_NAME}`,
      description: `Tow trucks in ${name} region (evakuator ${translit}), around the clock. Every truck in the region, with prices and photos — call the driver directly.`,
      keywords: [...baseKeywords(locale), `tow truck ${name}`, `evakuator ${translit}`].join(', '),
    }
  }

  return {
    title: `Էվակուատոր ${regionNameHy}ի մարզում · Evakuator ${translit} · 24/7 | ${SITE_NAME}`,
    description: `Էվակուատոր ${regionNameHy}ի մարզում (evakuator ${translit}) 24/7 ռեժիմով։ Գտեք մարզի բոլոր էվակուատորները, դիտեք գներն ու նկարները և զանգահարեք վարորդին անմիջապես։`,
    keywords: [
      ...baseKeywords(locale),
      `էվակուատոր ${regionNameHy}`,
      `evakuator ${translit}`,
    ].join(', '),
  }
}

/**
 * The homepage is the one page whose title leads with the BRAND rather than
 * with the service keyword.
 *
 * Every other page here is a landing page for a query («էվակուատոր
 * Աբովյանում»), and its title is built to match that query. The homepage is
 * what a search engine, a knowledge panel or an AI assistant reads to answer
 * "what is this site" — so it answers that question in its own words, in the
 * exact form we want quoted back, and the brand comes first because the risk
 * being managed is confusion with a similarly-named site.
 *
 * The service keyword is not lost: «էվակուատորների» is in the tagline, and the
 * description below still carries the full keyword set the previous title
 * shared with it.
 */
export function buildHomeSeo(locale = 'hy', tagline = SITE_TAGLINE): LocationSeo {
  if (locale === 'ru') {
    return {
      title: tagline,
      description:
        `${tagline}. Эвакуатор (evakuator) в Ереване и во всех марзах Армении, 24/7. ` +
        'Дешёвый эвакуатор (ejan evakuator), ночные вызовы (gisherayin evakuator), ' +
        'эвакуатор с манипулятором, новые проверенные водители, перевозка машин после ДТП. ' +
        'Звоните водителю напрямую.',
      keywords: [
        ...baseKeywords(locale),
        'эвакуатор Ереван',
        'evakuator erevan',
        'эвакуатор в марзах',
      ].join(', '),
    }
  }

  if (locale === 'en') {
    return {
      title: tagline,
      description:
        `${tagline}. Tow trucks (evakuator) in Yerevan and in every region of Armenia, 24/7. ` +
        'Cheap call-outs (ejan evakuator), night service (gisherayin evakuator), crane trucks, ' +
        'newly listed and checked drivers, recovery after an accident. ' +
        'Call the driver directly.',
      keywords: [
        ...baseKeywords(locale),
        'tow truck Yerevan',
        'evakuator erevan',
        'tow truck in the regions',
      ].join(', '),
    }
  }

  return {
    title: tagline,
    description:
      `${tagline}։ Էվակուատոր (evakuator) Երևանում և Հայաստանի բոլոր մարզերում՝ 24/7։ ` +
      'Էժան էվակուատոր (ejan evakuator), գիշերային ծառայություն (gisherayin evakuator), ' +
      'մանիպուլյատորով էվակուատոր, նոր ու ստուգված վարորդներ, վթարված մեքենաների տեղափոխում։ ' +
      'Զանգահարեք վարորդին ուղիղ։',
    keywords: [
      ...baseKeywords(locale),
      'էվակուատոր երևան',
      'evakuator erevan',
      'էվակուատոր մարզերում',
    ].join(', '),
  }
}

/**
 * Visible homepage SEO copy — the homepage previously had no on-page text
 * block at all, only meta tags. Meta keywords carry near-zero ranking
 * weight; this is what Google actually reads to match the target queries
 * (cheap, night/24-7, manipulator-equipped, newly-joined drivers, per city).
 */
export function buildHomeParagraphs(locale = 'hy'): string[] {
  if (locale === 'ru') {
    return [
      'На Evakuators.am вы найдёте эвакуатор (evakuator) в Ереване и во всех марзах Армении, ' +
        'в любое время — включая ночные вызовы (gisherayin evakuator, evakuator 24 jam). ' +
        'На карточке каждого водителя указаны реальные цены, поэтому выбрать самый дешёвый ' +
        'эвакуатор (ejan evakuator) в своём районе несложно.',
      'Нужен эвакуатор с манипулятором (manipulatorov evakuator) — для тяжёлой машины или для ' +
        'места, куда обычная платформа не подъедет? Все такие водители собраны на отдельной ' +
        'странице «Эвакуатор с манипулятором». Новые водители появляются на сайте постоянно, ' +
        'во всех марзах, так что список всё время обновляется.',
    ]
  }

  if (locale === 'en') {
    return [
      'Evakuators.am lists tow trucks (evakuator) in Yerevan and in every region of Armenia, at ' +
        'any hour — night call-outs included (gisherayin evakuator, evakuator 24 jam). Every ' +
        'driver card carries real prices, so picking the cheapest tow truck (ejan evakuator) in ' +
        'your area takes a moment.',
      'Need a crane truck (manipulatorov evakuator) for a heavy vehicle, or for somewhere an ' +
        'ordinary flatbed cannot reach? Those drivers are collected on their own "Crane tow ' +
        'truck" page. New drivers join in every region all the time, so the listing keeps ' +
        'changing.',
    ]
  }

  return [
    'Evakuators.am-ում կգտնեք էվակուատոր (evakuator) Երևանում և Հայաստանի բոլոր մարզերում, ' +
      'ցանկացած ժամի՝ ներառյալ գիշերային կանչերը (gisherayin evakuator, evakuator 24 jam)։ ' +
      'Յուրաքանչյուր վարորդի քարտի վրա տեսնում եք իրական գներ, ուստի հեշտությամբ կարող եք ' +
      'ընտրել ամենաէժան էվակուատորը (ejan evakuator) Ձեր տարածքում։',
    'Փնտրու՞մ եք մանիպուլյատորով էվակուատոր (manipulatorov evakuator) ծանր կամ դժվար հասանելի ' +
      'մեքենայի բարձման համար։ Ֆիլտրերում նշեք «Մանիպուլյատոր»՝ տեսնելու համար միայն այդ ' +
      'հնարավորությամբ մեքենաները։ Կայքին անընդհատ ավելանում են նոր էվակուատոր վարորդներ բոլոր ' +
      'մարզերում, այնպես որ ցանկը մշտապես թարմացվում է։',
  ]
}

/**
 * Visible bilingual paragraph for SeoTextSection — lets Google match
 * transliterated queries against real on-page content, without keyword stuffing.
 */
export function buildTranslitParagraph(
  nameHy: string,
  slug: string,
  locale = 'hy',
  kind: PlaceKind = 'city',
): string {
  const translit = translitFromSlug(slug)

  // `kind` is not cosmetic. Slugs are unique within a type and not across
  // them, so looking a marz up in the city map silently returns nothing and
  // the paragraph falls back to the Armenian name — a Russian sentence with
  // «Կոտայք» in the middle of it. The marz and district pages pass their own
  // kind; `city` stays the default because most callers are city pages.
  const name = localizedPlaceName(kind, slug, nameHy, locale)

  if (locale === 'ru') {
    // Every branch wraps the name in a classifier noun that takes the
    // preposition's case, rather than declining the name itself: the RU place
    // maps store only the nominative, and «в Аджапняке» needs a case ending no
    // map here supplies. «в районе X» sidesteps that the same way «в городе
    // X» and «в марзе X» do.
    const where =
      kind === 'region'
        ? `в марзе ${name}`
        : kind === 'district'
          ? `в районе ${name}`
          : `в городе ${name}`
    return `Evakuator ${translit} — услуги эвакуатора ${where} в любое время, включая ночные вызовы (evakuator 24 jam). Доступные цены (ejan evakuator), эвакуатор с манипулятором для тяжёлых машин, новые водители, быстрый приезд и прямая связь с водителем — без посредников.`
  }

  if (locale === 'en') {
    const where =
      kind === 'region' ? `${name} region` : kind === 'district' ? `${name} district` : name
    return `Evakuator ${translit} — tow truck service in ${where} at any hour, night call-outs included (evakuator 24 jam). Affordable rates (ejan evakuator), a crane-equipped truck for heavy vehicles, newly listed drivers, fast arrival, and the driver's own number — no middleman.`
  }

  return `Evakuator ${translit} — էվակուատորի ծառայություն ${nameHy}ում ցանկացած ժամի՝ ներառյալ գիշերային կանչերը (evakuator 24 jam)։ Մատչելի գներ (ejan evakuator), մանիպուլյատորով էվակուատոր տարբերակ ծանր մեքենաների համար, նոր վարորդներ, արագ ժամանում և ուղիղ կապ վարորդի հետ՝ առանց միջնորդների։`
}
