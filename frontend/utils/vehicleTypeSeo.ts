import type { VehicleTypeGeo, VehicleTypePage } from '~/constants/vehicleTypePages'
import { SITE_NAME } from '~/constants/site'
import { countryLocative, countryName } from '~/i18n/vehicleTypeCopy'

/**
 * The `<title>`, description, keywords, `<h1>` and body copy of every
 * vehicle-type page — the country-wide one and each of its eleven geo
 * variants.
 *
 * ## Why a builder and not eleven more config objects
 *
 * Twenty-two hand-written pages of copy is twenty-two pages to keep consistent,
 * and the first thing that drifts is the one thing that must not: the exact
 * keyword. Here the vocabulary is written once per vehicle type
 * (`VehicleTypeSeoVocabulary`) and once per place (`VehicleTypeGeo`), and every
 * page is the two composed. Adding a marz adds eleven-ish sentences with no
 * copywriting; adding a third landing page adds vocabulary and no builder.
 *
 * ## Why the same bilingual rule as the geography pages
 *
 * People type «մանիպուլյատոր Երևան» and «manipulator erevan» in comparable
 * numbers — the observation `utils/seoContent.ts` is built on. That file
 * applies it to the "where are you" axis; this one applies it to the "what do
 * you need" axis, and the geo pages are where the two meet.
 *
 * ## What is deliberately NOT here
 *
 * No superlatives, no invented counts and no «լավագույն» — the pages must be
 * able to say true things about a listing that changes hourly. The numbers a
 * visitor sees come from the cards themselves.
 */

export interface VehicleTypeSeo {
  title: string
  description: string
  keywords: string
}

/**
 * Cross-cutting terms every one of these pages competes for.
 *
 * The Latin pair stays in all three lists on purpose: `evakuator` is what a
 * Russian- or English-speaking visitor in Armenia types just as often as the
 * word in their own language, and it is the term the local competition is
 * optimised for.
 */
const BASE_KEYWORDS: Record<string, string[]> = {
  hy: ['էվակուատոր', 'evakuator', 'evakuator hayastan', 'էվակուատոր Հայաստան'],
  ru: ['эвакуатор', 'evakuator', 'evakuator hayastan', 'эвакуатор Армения'],
  en: ['tow truck', 'evakuator', 'evakuator hayastan', 'tow truck Armenia'],
}

/**
 * The full stop.
 *
 * Armenian ends a sentence with «։», not with a dot, and the description below
 * is assembled from a template rather than written out — so without this the
 * Russian and English pages inherited an Armenian terminator in the middle of
 * an otherwise translated meta description. Invisible in review, visible in a
 * search result.
 */
const FULL_STOP: Record<string, string> = { hy: '։', ru: '.', en: '.' }

/** What the meta description promises after the keywords have been spent */
const META_TAIL: Record<string, string> = {
  hy: 'Գներ, բեռնատարողություն, ուղիղ զանգ վարորդին։',
  ru: 'Цены, грузоподъёмность, прямой звонок водителю.',
  en: 'Prices, payload, and a direct call to the driver.',
}

/** The `<h2>` above the body copy — a real question, not a keyword label */
const SEO_TITLE_TAIL: Record<string, string> = {
  hy: '— ինչ պետք է իմանալ',
  ru: '— что нужно знать',
  en: '— what you should know',
}

/**
 * The `<h1>` and the breadcrumb leaf.
 *
 * The country page says «Հայաստանում» rather than nothing at all: an `<h1>` of
 * «Մանիպուլյատորով էվակուատոր» describes a vehicle, and the page is a
 * directory of drivers. Naming the area is what makes the heading answer the
 * query it is trying to rank for, and it is what keeps the eleven geo headings
 * from looking like a different kind of page.
 */
export function buildVehicleTypeHeading(
  page: VehicleTypePage,
  geo?: VehicleTypeGeo,
  locale = 'hy',
): string {
  return `${page.heading} ${geo ? geo.locative : countryLocative(locale)}`
}

/**
 * Title, description and keywords.
 *
 * The title follows the shape `buildLocationSeo` established and every city
 * page already uses — Armenian phrase, transliteration, then the brand — so a
 * SERP full of this site's results reads as one site. The brand comes last,
 * not first: unlike the homepage these are landing pages for a query, and the
 * query belongs at the front where it is not truncated.
 */
export function buildVehicleTypeSeo(
  page: VehicleTypePage,
  geo?: VehicleTypeGeo,
  locale = 'hy',
): VehicleTypeSeo {
  const { seo } = page
  const place = geo ? geo.name : countryName(locale)
  const placeLocative = geo ? geo.locative : countryLocative(locale)
  const translitPlaces = geo ? [geo.translit, ...geo.translitAliases] : ['hayastan']

  const title = geo
    ? `${page.heading} ${geo.locative} · ${seo.keywordTranslit} ${geo.translit} | ${SITE_NAME}`
    : `${page.title} · ${seo.keywordTranslit} | ${SITE_NAME}`

  // Written to survive truncation, not to say everything. Google cuts a
  // description somewhere around 160 characters, so the query terms — the
  // service, the place, the transliteration — are spent first and the sales
  // pitch is what gets dropped if a long marz name pushes it over.
  const stop = FULL_STOP[locale] ?? FULL_STOP.hy
  const description = geo
    ? `${page.heading} ${geo.locative} (${seo.keywordTranslit} ${geo.translit})${stop} ` +
      `${seo.metaTeaser} ${META_TAIL[locale] ?? META_TAIL.hy}`
    : page.description

  // Place first in each pair, because that is the order the query is typed in:
  // «մանիպուլյատոր Երևան», not «Երևան մանիպուլյատոր».
  const geoKeywords = translitPlaces.flatMap((translit) => [
    `${seo.shortKeywordTranslit} ${translit}`,
    `${seo.keywordTranslit} ${translit}`,
  ])

  const keywords = [
    seo.keyword,
    seo.shortKeyword,
    seo.keywordTranslit,
    seo.shortKeywordTranslit,
    `${seo.shortKeyword} ${place}`,
    `${seo.keyword} ${placeLocative}`,
    ...geoKeywords,
    ...seo.extraKeywords,
    ...(BASE_KEYWORDS[locale] ?? BASE_KEYWORDS.hy),
  ]

  // Deduped: the country page's `${shortKeyword} Հայաստան` and its
  // transliterated twin can otherwise collide with an extraKeywords entry, and
  // a repeated term in this meta reads as stuffing rather than as coverage.
  return { title, description, keywords: [...new Set(keywords)].join(', ') }
}

/**
 * The visible body copy, rendered BELOW the listing.
 *
 * Position is the whole argument. These pages were built with no prose at all,
 * because a visitor who searched «մանիպուլյատոր» has already said what they
 * need and every paragraph above the cards is one more thing between them and
 * a phone number (`docs/pages-and-routes.md`). That reasoning is about what
 * comes FIRST, not about whether the page may contain sentences — and a page
 * whose only text is its `<h1>` is thin content that cannot rank for the query
 * it was built for. So the copy exists, and it sits after the drivers and next
 * to the FAQ, where it delays nobody.
 *
 * ## Why the place-specific paragraph is first
 *
 * It is the only paragraph that differs between the eleven geo pages. Leading
 * with it means each page opens on its own subject rather than on two
 * paragraphs it shares with ten siblings — which is the difference between one
 * service documented per area and eleven near-duplicates.
 */
export function buildVehicleTypeParagraphs(
  page: VehicleTypePage,
  geo?: VehicleTypeGeo,
  locale = 'hy',
): string[] {
  const { seo } = page

  if (locale === 'ru') {
    // `seo.keyword` rather than `shortKeyword` in the sentences that need an
    // accusative: both keywords start with «эвакуатор» — masculine inanimate,
    // so the accusative is identical to the nominative — while «тяжёлая
    // техника» would have to become «тяжёлую технику» and no template can do
    // that for an arbitrary noun.
    const openerRu = geo
      ? `${page.heading} ${geo.locative} (${seo.shortKeywordTranslit} ${geo.translit}) — на этой ` +
        `странице собраны водители, которые работают ${geo.locative}. На карточке каждого из них ` +
        'указаны грузоподъёмность, рабочие часы, обслуживаемые районы и начальная цена, а звонок ' +
        'идёт напрямую водителю — без посредника и без наценки.'
      : `${page.title} (${seo.keywordTranslit}) — на этой странице собраны водители из всех ` +
        'марзов, от Еревана до Сюника. Выберите свой марз ниже или посмотрите весь список — с ' +
        'реальными фотографиями, грузоподъёмностью и начальными ценами.'

    const availabilityRu = geo
      ? `Часть водителей работает круглосуточно, 24/7, поэтому ${seo.keyword} можно вызвать и ` +
        `ночью. Если ${geo.locative} сейчас нет свободного водителя, посмотрите страницы соседних ` +
        'марзов или раздел «Свободные маршруты»: на уже запланированных направлениях цена обычно ниже.'
      : 'Часть водителей работает круглосуточно, 24/7. При перевозке из марза в марз загляните ' +
        'также в раздел «Свободные маршруты»: там водители сами объявляют уже запланированные ' +
        'направления, и это обычно дешевле.'

    return [openerRu, seo.explainer, seo.whenNeeded, availabilityRu]
  }

  if (locale === 'en') {
    const openerEn = geo
      ? `${page.heading} ${geo.locative} (${seo.shortKeywordTranslit} ${geo.translit}) — this page ` +
        `collects the drivers working ${geo.locative}. Every card shows the payload, the working ` +
        'hours, the areas covered and a starting price, and the call goes straight to the driver ' +
        '— no agency in between and no markup.'
      : `${page.title} (${seo.keywordTranslit}) — this page collects the drivers from every ` +
        'region, from Yerevan down to Syunik. Pick your area below or browse the whole list, with ' +
        'real photos, payloads and starting prices.'

    const availabilityEn = geo
      ? `Some drivers work around the clock, 24/7, so you can call a ${seo.keyword} at night as ` +
        `well. If nobody is free ${geo.locative} right now, try the neighbouring regions or the ` +
        '"Free routes" section — a trip that is already planned usually costs less.'
      : 'Some drivers work around the clock, 24/7. For a move between regions, look at the "Free ' +
        'routes" section as well: drivers post the trips they have already planned there, which ' +
        'is usually cheaper.'

    return [openerEn, seo.explainer, seo.whenNeeded, availabilityEn]
  }

  const opener = geo
    ? `${page.heading} ${geo.locative} (${seo.shortKeywordTranslit} ${geo.translit}) — այս էջում ` +
      `հավաքված են ${geo.locative} աշխատող ${seo.keyword} վարորդները։ Յուրաքանչյուր քարտին նշված են ` +
      'բեռնատարողությունը, աշխատանքային ժամերը, սպասարկվող տարածքները և մեկնարկային գինը, ' +
      'իսկ զանգը գնում է ուղիղ վարորդին՝ առանց միջնորդի և առանց հավելավճարի։'
    : `${page.heading} Հայաստանում (${seo.keywordTranslit}) — այս էջում հավաքված են բոլոր մարզերի ` +
      `${seo.keyword} վարորդները՝ Երևանից մինչև Սյունիք։ Ընտրեք ձեր տարածքը ստորև կամ դիտեք ամբողջ ` +
      'ցանկը՝ իրական նկարներով, բեռնատարողությամբ և մեկնարկային գներով։'

  const availability = geo
    ? `Վարորդների մի մասն աշխատում է շուրջօրյա՝ 24/7, ուստի ${seo.shortKeyword} կարող եք կանչել ` +
      `նաև գիշերը։ Եթե ${geo.locative} այս պահին ազատ վարորդ չկա, նայեք հարևան մարզերի էջերը կամ ` +
      '«Ազատ երթուղիներ» բաժինը՝ արդեն պլանավորված ուղղությունների համար գինը սովորաբար ավելի ցածր է։'
    : `Վարորդների մի մասն աշխատում է շուրջօրյա՝ 24/7։ Միջմարզային տեղափոխման դեպքում նայեք նաև ` +
      '«Ազատ երթուղիներ» բաժինը՝ այնտեղ վարորդներն իրենք են հայտարարում արդեն պլանավորված ' +
      'ուղղությունները, ինչը սովորաբար ավելի էժան է։'

  return [opener, seo.explainer, seo.whenNeeded, availability]
}

export function buildVehicleTypeSeoTitle(
  page: VehicleTypePage,
  geo?: VehicleTypeGeo,
  locale = 'hy',
): string {
  const place = geo ? geo.locative : countryLocative(locale)
  return `${page.heading} ${place} ${SEO_TITLE_TAIL[locale] ?? SEO_TITLE_TAIL.hy}`
}
