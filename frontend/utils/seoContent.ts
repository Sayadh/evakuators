import { SITE_NAME, SITE_TAGLINE } from '~/constants/site'
import { localizedPlaceName } from '~/i18n/placeNames'

/**
 * SEO keyword strategy.
 *
 * People search both in Armenian script («էվակուատոր երևան») and in
 * transliterated Latin («evakuator erevan», «evakuator 24 jam», «ejan evakuator»).
 * Every location page therefore carries BOTH variants in its title,
 * description, keywords meta and visible SEO text.
 */

const BASE_KEYWORDS = [
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
]

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
export function buildLocationSeo(nameHy: string, slug: string, locale = 'hy'): LocationSeo {
  const translit = translitFromSlug(slug)
  const name = localizedPlaceName('city', slug, nameHy, locale)

  if (locale === 'ru') {
    return {
      title: `Эвакуатор ${name} · Evakuator ${translit} · 24/7 | ${SITE_NAME}`,
      description: `Эвакуатор в городе ${name} (evakuator ${translit}) круглосуточно. Недорогой эвакуатор, ночные вызовы, перевозка аварийных и неисправных машин. Реальные фотографии, цены, прямая связь с водителем.`,
      keywords: [...BASE_KEYWORDS, `эвакуатор ${name}`, `evakuator ${translit}`].join(', '),
    }
  }

  if (locale === 'en') {
    return {
      title: `Tow truck in ${name} · Evakuator ${translit} · 24/7 | ${SITE_NAME}`,
      description: `Tow truck in ${name} (evakuator ${translit}), around the clock. Affordable rates, night call-outs, transport of damaged and non-running vehicles. Real photos, prices, and the driver's own number.`,
      keywords: [...BASE_KEYWORDS, `tow truck ${name}`, `evakuator ${translit}`].join(', '),
    }
  }

  return {
    title: `Էվակուատոր ${nameHy}ում · Evakuator ${translit} · 24/7 | ${SITE_NAME}`,
    description: `Էվակուատոր ${nameHy}ում (evakuator ${translit}) 24/7 ռեժիմով։ Էժան էվակուատոր, գիշերային ծառայություն, վթարված և չաշխատող մեքենաների տեղափոխում։ Իրական նկարներ, գներ, ուղիղ կապ վարորդի հետ։`,
    keywords: [
      ...BASE_KEYWORDS,
      `էվակուատոր ${nameHy}`,
      `evakuator ${translit}`,
      `evakuator ${translit} 24 jam`,
      `ejan evakuator ${translit}`,
    ].join(', '),
  }
}

export function buildRegionSeo(regionNameHy: string, slug: string, locale = 'hy'): LocationSeo {
  const translit = translitFromSlug(slug)
  const name = localizedPlaceName('region', slug, regionNameHy, locale)

  if (locale === 'ru') {
    return {
      title: `Эвакуатор ${name} · Evakuator ${translit} · 24/7 | ${SITE_NAME}`,
      description: `Эвакуатор в марзе ${name} (evakuator ${translit}) круглосуточно. Все эвакуаторы марза, цены и фотографии — позвоните водителю напрямую.`,
      keywords: [...BASE_KEYWORDS, `эвакуатор ${name}`, `evakuator ${translit}`].join(', '),
    }
  }

  if (locale === 'en') {
    return {
      title: `Tow truck in ${name} · Evakuator ${translit} · 24/7 | ${SITE_NAME}`,
      description: `Tow trucks in ${name} region (evakuator ${translit}), around the clock. Every truck in the region, with prices and photos — call the driver directly.`,
      keywords: [...BASE_KEYWORDS, `tow truck ${name}`, `evakuator ${translit}`].join(', '),
    }
  }

  return {
    title: `Էվակուատոր ${regionNameHy}ի մարզում · Evakuator ${translit} · 24/7 | ${SITE_NAME}`,
    description: `Էվակուատոր ${regionNameHy}ի մարզում (evakuator ${translit}) 24/7 ռեժիմով։ Գտեք մարզի բոլոր էվակուատորները, դիտեք գներն ու նկարները և զանգահարեք վարորդին անմիջապես։`,
    keywords: [
      ...BASE_KEYWORDS,
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
export function buildHomeSeo(): LocationSeo {
  return {
    title: SITE_TAGLINE,
    description:
      `${SITE_TAGLINE}։ Էվակուատոր (evakuator) Երևանում և Հայաստանի բոլոր մարզերում՝ 24/7։ ` +
      'Էժան էվակուատոր (ejan evakuator), գիշերային ծառայություն (gisherayin evakuator), ' +
      'մանիպուլյատորով էվակուատոր, նոր ու ստուգված վարորդներ, վթարված մեքենաների տեղափոխում։ ' +
      'Զանգահարեք վարորդին ուղիղ։',
    keywords: [
      ...BASE_KEYWORDS,
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
export function buildHomeParagraphs(): string[] {
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
export function buildTranslitParagraph(nameHy: string, slug: string, locale = 'hy'): string {
  const translit = translitFromSlug(slug)

  if (locale === 'ru') {
    const name = localizedPlaceName('city', slug, nameHy, locale)
    return `Evakuator ${translit} — услуги эвакуатора в городе ${name} в любое время, включая ночные вызовы (evakuator 24 jam). Доступные цены (ejan evakuator), эвакуатор с манипулятором для тяжёлых машин, новые водители, быстрый приезд и прямая связь с водителем — без посредников.`
  }

  if (locale === 'en') {
    const name = localizedPlaceName('city', slug, nameHy, locale)
    return `Evakuator ${translit} — tow truck service in ${name} at any hour, night call-outs included (evakuator 24 jam). Affordable rates (ejan evakuator), a crane-equipped truck for heavy vehicles, newly listed drivers, fast arrival, and the driver's own number — no middleman.`
  }

  return `Evakuator ${translit} — էվակուատորի ծառայություն ${nameHy}ում ցանկացած ժամի՝ ներառյալ գիշերային կանչերը (evakuator 24 jam)։ Մատչելի գներ (ejan evakuator), մանիպուլյատորով էվակուատոր տարբերակ ծանր մեքենաների համար, նոր վարորդներ, արագ ժամանում և ուղիղ կապ վարորդի հետ՝ առանց միջնորդների։`
}
