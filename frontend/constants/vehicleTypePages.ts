import { staticRegions } from '~/data/regions'
import type { FaqItem } from '~/types/common'
import { VehicleType } from '~/types/enums'

/**
 * The two vehicle-type landing pages: `/manipulator` and `/tsanr-tehnika`.
 *
 * ## Why these two and not one page per `VehicleType`
 *
 * `flatbed` is what most of the fleet is — a page for it would be the tow-truck
 * listing with extra steps — and `sliding-platform` is a detail of how a
 * flatbed loads rather than a thing people search for. These two are different:
 * a crane and a truck that can carry a bus are the two capabilities someone
 * arrives already looking for, and the ones they will not settle for a
 * substitute on. Adding a third page means adding an entry here and a
 * `pages/<slug>.vue` that renders `VehicleTypeListing`; nothing else.
 *
 * ## Why the whole page is described in one object
 *
 * Route, nav label, heading, metadata, sitemap entry and breadcrumb all have to
 * agree, and they are otherwise six files apart. A page that is listed in the
 * nav but missing from the sitemap, or whose `<title>` names one thing while
 * its heading names another, is the failure this shape prevents — the same
 * argument as `SITE_NAME` living in exactly one place (CLAUDE.md § "Brand
 * identity surfaces").
 */
/**
 * The search vocabulary of one vehicle type.
 *
 * Armenian **and** transliterated Latin, because both are typed in roughly
 * equal measure («մանիպուլյատոր» / «manipulator») — the same bilingual rule
 * `utils/seoContent.ts` applies to every geography page, applied to the
 * "what do you need" axis instead of the "where are you" one.
 *
 * The short form matters more than the long one. Someone looking for a crane
 * types «մանիպուլյատոր», not «մանիպուլյատորով էվակուատոր»; the long form is
 * what the page is *called*, the short form is what is *searched*, and a page
 * that only ever writes the long form matches the short query weakly.
 */
export interface VehicleTypeSeoVocabulary {
  /** The full service name: «մանիպուլյատորով էվակուատոր» */
  keyword: string
  /** …as typed in Latin: «manipulatorov evakuator» */
  keywordTranslit: string
  /** The bare noun people actually search: «մանիպուլյատոր» */
  shortKeyword: string
  /** …as typed in Latin: «manipulator» */
  shortKeywordTranslit: string
  /**
   * Query variants that cannot be derived from the four above — synonyms and
   * the words people use when they do not know the term («ավտոկռունկ»).
   * Geography is NEVER written here: the builder adds every place itself, so a
   * new marz cannot be forgotten in one page's list and present in the other's.
   */
  extraKeywords: string[]
  /**
   * One sentence: what this vehicle does. Reused verbatim as the schema.org
   * `Service.description`, so it has to read as a definition rather than as
   * marketing — it is what an AI assistant is most likely to quote back.
   */
  serviceSummary: string
  /**
   * The same thing in about forty characters, for the `<meta description>`.
   *
   * `serviceSummary` cannot do this job: a meta description is truncated in a
   * search result somewhere around 160 characters, and once the heading, the
   * place and the transliteration have been spent there is no room left for a
   * full definition. Written separately rather than sliced, because a sentence
   * cut mid-word is what the ellipsis in a bad SERP result actually is.
   */
  metaTeaser: string
  /**
   * What the vehicle is, in a sentence or two. Geography-free on purpose: the
   * builder puts the place-specific paragraph FIRST and this after it, so
   * eleven geo pages share this text without any of them being a rewrite of
   * another. That is the line between "one service explained on eleven pages"
   * and eleven near-duplicate pages.
   */
  explainer: string
  /** When someone needs it — the paragraph that answers search intent */
  whenNeeded: string
}

export interface VehicleTypePage {
  /** Route segment — the page is `/${slug}` */
  slug: string
  /**
   * What is actually being asked for.
   *
   * Sent to the backend as `?vehicleType=`, which narrows the listing. For
   * `manipulator` the backend answers with a **union** — the vehicle type OR
   * the equipment checkbox — because the registration form asks that question
   * twice and either answer counts. See `docs/taxonomies.md`.
   */
  vehicleType: VehicleType
  /** Header/footer nav — short, because it sits next to three other items */
  navLabel: string
  /** `<h1>`, the breadcrumb leaf and the JSON-LD list name */
  heading: string
  title: string
  /** `<meta name="description">` — what a search result shows under the title */
  description: string
  /**
   * The words people actually type, and the sentences built from them.
   *
   * Kept here rather than in `utils/vehicleTypeSeo.ts` for the same reason
   * everything else about the page is: the builder knows the *shape* of a
   * title, a description and a paragraph; only this object knows that a
   * manipulator is a crane and a `heavy-duty` is a truck that can carry a bus.
   * Adding a third landing page then means adding vocabulary, not editing a
   * builder with a growing `if`.
   *
   * Every geo variant of this page (`/manipulator/kotayk`) is composed from
   * exactly these strings plus a place name — see `vehicleTypeSeo.ts`.
   */
  seo: VehicleTypeSeoVocabulary
  /**
   * The FAQ under the cards, and the page's only on-page prose.
   *
   * Everything else was stripped — no filters, no sort, no CTA, no intro
   * paragraphs — because the URL is already the filter and controls only stand
   * between a visitor and a phone number. The FAQ is the deliberate exception:
   * it is the one block that earns its place for search rather than for the
   * person who already knows what they want, and it sits **below** the listing
   * so it never delays them.
   *
   * Rendered through `FaqSection`, which emits `FAQPage` JSON-LD from the same
   * array (`buildFaqSchema`) — so the structured data and the visible text
   * cannot describe different questions, which is the thing Google penalises.
   * Answers carry the search terms people actually type, including the
   * transliterated forms («manipulatorov evakuator»), the same way
   * `utils/seoContent.ts` does for the geography pages.
   */
  faq: FaqItem[]
}

const MANIPULATOR: VehicleTypePage = {
  slug: 'manipulator',
  vehicleType: VehicleType.Manipulator,
  navLabel: 'Մանիպուլյատորներ',
  heading: 'Մանիպուլյատորով էվակուատոր',
  title: 'Մանիպուլյատորով էվակուատոր Հայաստանում',
  description:
    'Կռունկով (մանիպուլյատորով) էվակուատորներ Հայաստանում՝ դժվար հասանելի վայրերից մեքենա ' +
    'բարձրացնելու համար։ Տեսեք հասանելի վարորդներին, գները և զանգահարեք ուղիղ։',
  seo: {
    keyword: 'մանիպուլյատորով էվակուատոր',
    keywordTranslit: 'manipulatorov evakuator',
    shortKeyword: 'մանիպուլյատոր',
    shortKeywordTranslit: 'manipulator',
    extraKeywords: [
      'կռունկով էվակուատոր',
      'ավտոկռունկ',
      'մանիպուլյատոր վարձով',
      'մանիպուլյատորի ծառայություն',
      'krunkov evakuator',
      'manipulator vardzov',
      'avtokrunk',
    ],
    serviceSummary:
      'Կռունկով (մանիպուլյատորով) էվակուատորի ծառայություն՝ մեքենայի կամ բեռի ուղղահայաց ' +
      'բարձրացում և տեղափոխում այնտեղից, ուր սովորական հարթակը չի կարող մոտենալ։',
    metaTeaser: 'Կռունկով բարձրացում դժվար հասանելի վայրերից։',
    explainer:
      'Մանիպուլյատորով էվակուատորը կռունկ ունեցող բեռնատար է. մեքենան բարձրացվում է ուղղահայաց՝ ' +
      'առանց քարշակելու։ Սովորական հարթակով էվակուատորը մեքենան քաշում է հարթակի վրա, մինչդեռ ' +
      'մանիպուլյատորը կարող է այն վերցնել վերևից՝ նույնիսկ այնտեղից, ուր բեռնատարը չի կարող մոտենալ։',
    whenNeeded:
      'Կռունկ է պետք, երբ մեքենան ընկել է ձորը կամ փոսը, կանգնած է նեղ բակում, ստորգետնյա ' +
      'ավտոկայանատեղիում կամ երկու մեքենայի արանքում, ինչպես նաև՝ երբ պետք է տեղափոխել ծանր առարկա, ' +
      'շինարարական տեխնիկա, կոնտեյներ կամ գեներատոր։',
  },
  faq: [
    {
      question: 'Ի՞նչ է մանիպուլյատորով էվակուատորը',
      answer:
        'Մանիպուլյատորով էվակուատորը (manipulatorov evakuator) կռունկ ունեցող բեռնատար է, որով ' +
        'մեքենան բարձրացվում է ուղղահայաց՝ առանց քարշակելու։ Սովորական հարթակով էվակուատորը ' +
        'մեքենան քաշում է հարթակի վրա, մինչդեռ մանիպուլյատորը կարող է այն վերցնել վերևից՝ նույնիսկ ' +
        'այնտեղից, ուր բեռնատարը չի կարող մոտենալ։',
    },
    {
      question: 'Ե՞րբ է պետք մանիպուլյատորով էվակուատոր',
      answer:
        'Երբ մեքենան հնարավոր չէ քաշել հարթակի վրա՝ ընկել է ձորը կամ փոսը, կանգնած է նեղ բակում, ' +
        'ստորգետնյա ավտոկայանատեղիում կամ երկու մեքենայի արանքում։ Նաև՝ երբ պետք է տեղափոխել ծանր ' +
        'առարկա, շինարարական տեխնիկա կամ կոնտեյներ։',
    },
    {
      question: 'Որքա՞ն է արժե մանիպուլյատորով էվակուատորի ծառայությունը',
      answer:
        'Գինը կախված է հեռավորությունից, մեքենայի քաշից, աշխատանքի բարդությունից և ժամից։ ' +
        'Յուրաքանչյուր վարորդի քարտին նշված է մեկնարկային գինը. ճշգրիտ արժեքը ճշտեք ուղիղ ' +
        'զանգահարելիս՝ առանց միջնորդների։',
    },
    {
      question: 'Կարո՞ղ եմ գիշերը կանչել մանիպուլյատորով էվակուատոր',
      answer:
        'Այո։ Վարորդների մի մասն աշխատում է շուրջօրյա՝ 24/7։ Յուրաքանչյուր քարտին նշված են ' +
        'աշխատանքային ժամերը, իսկ շուրջօրյա աշխատողների մոտ՝ 24/7 նշումը։',
    },
    {
      question: 'Ամբողջ Հայաստանու՞մ են աշխատում',
      answer:
        'Այս էջում հավաքված են բոլոր մարզերի մանիպուլյատորով էվակուատորները։ Յուրաքանչյուր քարտին ' +
        'նշված է վարորդի հիմնական գտնվելու վայրը և սպասարկվող տարածքները՝ Երևան, Գյումրի, Վանաձոր ' +
        'և մյուս քաղաքները։',
    },
  ],
}

const HEAVY_DUTY: VehicleTypePage = {
  slug: 'tsanr-tehnika',
  vehicleType: VehicleType.HeavyDuty,
  navLabel: 'Ծանր տեխնիկա',
  heading: 'Ծանր տեխնիկայի էվակուատոր',
  title: 'Ծանր տեխնիկայի էվակուատոր Հայաստանում',
  description:
    'Բեռնատարների, ավտոբուսների և ծանր տեխնիկայի էվակուացում Հայաստանում։ ' +
    'Տեսեք համապատասխան բեռնատարողությամբ վարորդներին և զանգահարեք ուղիղ։',
  seo: {
    keyword: 'ծանր տեխնիկայի էվակուատոր',
    keywordTranslit: 'tsanr tehnikayi evakuator',
    shortKeyword: 'ծանր տեխնիկա',
    shortKeywordTranslit: 'tsanr tehnika',
    extraKeywords: [
      'բեռնատարի էվակուատոր',
      'ավտոբուսի էվակուատոր',
      'մեծ էվակուատոր',
      'ծանր տեխնիկայի տեղափոխում',
      'շինարարական տեխնիկայի տեղափոխում',
      'trailer evakuator',
      'bernatari evakuator',
      'mec evakuator',
    ],
    serviceSummary:
      'Մեծ բեռնատարողությամբ էվակուատորի ծառայություն՝ բեռնատարների, ավտոբուսների, ' +
      'միկրոավտոբուսների և շինարարական տեխնիկայի տեղափոխման համար։',
    metaTeaser: 'Բեռնատարների, ավտոբուսների և շինտեխնիկայի տեղափոխում։',
    explainer:
      'Ծանր տեխնիկայի էվակուատորը մեծ բեռնատարողությամբ և երկար հարթակով մեքենա է։ Սովորական ' +
      'մարդատար էվակուատորի բեռնատարողությունը նման աշխատանքի համար բավարար չէ, ուստի կարևոր է ' +
      'նախապես ճշտել ոչ միայն քաշը, այլև տեխնիկայի երկարությունն ու լայնությունը։',
    whenNeeded:
      'Այս տեսակի էվակուատոր է պետք բեռնատարի, ավտոբուսի, միկրոավտոբուսի, էքսկավատորի, ' +
      'բուլդոզերի, ամբարձիչի կամ այլ շինարարական տեխնիկայի տեղափոխման համար՝ ինչպես վթարից հետո, ' +
      'այնպես էլ պլանավորված օբյեկտից օբյեկտ տեղափոխման դեպքում։',
  },
  faq: [
    {
      question: 'Ի՞նչ է ծանր տեխնիկայի էվակուատորը',
      answer:
        'Ծանր տեխնիկայի էվակուատորը (tsanr tehnikayi evakuator) մեծ բեռնատարողությամբ մեքենա է՝ ' +
        'բեռնատարներ, ավտոբուսներ, միկրոավտոբուսներ և շինարարական տեխնիկա տեղափոխելու համար։ ' +
        'Սովորական մարդատար էվակուատորի բեռնատարողությունը նման աշխատանքի համար բավարար չէ։',
    },
    {
      question: 'Ի՞նչ քաշի տեխնիկա են տեղափոխում',
      answer:
        'Յուրաքանչյուր վարորդի քարտին նշված է առավելագույն բեռնատարողությունը՝ տոննաներով։ ' +
        'Ընտրեք ձեր տեխնիկայի քաշին համապատասխանողը և ճշտեք զանգահարելիս, քանի որ կարևոր է նաև ' +
        'տեխնիկայի երկարությունն ու լայնությունը։',
    },
    {
      question: 'Կարո՞ղ են բարձրացնել շինարարական տեխնիկա',
      answer:
        'Եթե տեխնիկան պետք է բարձրացնել, այլ ոչ թե քաշել հարթակի վրա, ձեզ պետք է կռունկով ' +
        'էվակուատոր՝ տեսեք «Մանիպուլյատորով էվակուատոր» էջը։ Շատ վարորդներ ունեն և՛ մեծ հարթակ, ' +
        'և՛ մանիպուլյատոր։',
    },
    {
      question: 'Որքա՞ն է արժե ծանր տեխնիկայի էվակուացումը',
      answer:
        'Գինը կախված է տեխնիկայի քաշից, հեռավորությունից և աշխատանքի բարդությունից։ Քարտին ' +
        'նշված է մեկնարկային գինը. ճշգրիտ արժեքը ճշտեք ուղիղ վարորդի հետ՝ առանց միջնորդների։',
    },
    {
      question: 'Միջմարզային տեղափոխում անու՞մ են',
      answer:
        'Այո։ Յուրաքանչյուր քարտին նշված են վարորդի սպասարկվող տարածքները։ Երկար ուղղությունների ' +
        'համար նայեք նաև «Ազատ երթուղիներ» էջը՝ այնտեղ վարորդները հայտարարում են արդեն ' +
        'պլանավորված երթուղիներ, ինչը սովորաբար ավելի էժան է։',
    },
  ],
}

/**
 * Keyed by slug so a route param resolves in one lookup, and iterable for the
 * nav and the sitemap. One collection, so a page cannot exist in the nav
 * without existing in the sitemap.
 */
export const VEHICLE_TYPE_PAGES = {
  [MANIPULATOR.slug]: MANIPULATOR,
  [HEAVY_DUTY.slug]: HEAVY_DUTY,
} as const

export const VEHICLE_TYPE_PAGE_LIST: VehicleTypePage[] = [MANIPULATOR, HEAVY_DUTY]

/** Named exports for the two page files, so neither has to index by a string */
export const MANIPULATOR_PAGE = MANIPULATOR
export const HEAVY_DUTY_PAGE = HEAVY_DUTY

/* ── Geography variants ──────────────────────────────────────────────────
 *
 * `/manipulator/kotayk`, `/manipulator/yerevan`, and the same eleven under
 * `/tsanr-tehnika`.
 *
 * ## Why these pages exist at all
 *
 * «մանիպուլյատոր Երևան» is a different query from «մանիպուլյատոր», and one
 * country-wide page answers it weakly: it is about the country, its heading
 * says so, and every competitor with a city page outranks it on the city
 * query. This is the same reason `/regions/:region/:city` exists on the
 * geography axis — a page per question people actually ask.
 *
 * ## Why marzes and Yerevan, and not cities
 *
 * Supply. There are far fewer crane and heavy-duty drivers than ordinary
 * flatbeds, so 46 city pages per type would mostly be empty — and 92 empty
 * pages is a doorway farm, which is the exact trap `docs/pages-and-routes.md`
 * records for the 300 settlements. Eleven areas is the coarsest split that
 * still matches how people search, and each one has a real chance of having a
 * driver. A page with none is `noindex` and stays out of the sitemap (see
 * `VehicleTypeListing.vue` and `server/routes/sitemap.xml.ts`) — reachable,
 * never announced.
 *
 * ## Why the locative is stored and not derived
 *
 * Armenian does not add one suffix to every name: it is «Կոտայքի մարզում» but
 * «Լոռու մարզում», and Yerevan takes no «մարզ» at all. `utils/seoContent.ts`
 * builds `${name}ի մարզում` by concatenation and therefore writes «Լոռիի
 * մարզում» today. A heading is the most-read string on the page; it is worth
 * eleven hand-written words rather than a rule with exceptions.
 */
export interface VehicleTypeGeo {
  /** URL segment — the page is `/${pageSlug}/${slug}` */
  slug: string
  /** Bare name, for breadcrumbs and link lists: «Կոտայք» */
  name: string
  /** Locative, for headings and prose: «Կոտայքի մարզում», «Երևանում» */
  locative: string
  /** How this place is typed in Latin: «kotayk», «erevan» */
  translit: string
  /**
   * Extra Latin spellings people actually type. Yerevan is the one that
   * matters — both «yerevan» and «erevan» are in wide use, and the URL can
   * only be one of them.
   */
  translitAliases: string[]
  /**
   * Yerevan is not a marz. It is the `yerevan=true` filter rather than
   * `region=`, exactly as `/yerevan` is (see CLAUDE.md § geography), and this
   * flag is what the data layer branches on.
   */
  isYerevan?: boolean
}

/** «Երևան» — the highest-volume geo query on the site, so it leads the list */
const YEREVAN_GEO: VehicleTypeGeo = {
  slug: 'yerevan',
  name: 'Երևան',
  locative: 'Երևանում',
  translit: 'yerevan',
  translitAliases: ['erevan'],
  isYerevan: true,
}

/**
 * Locative form per marz slug — the half of `VehicleTypeGeo` that cannot be
 * derived from `staticRegions`. Keyed by slug rather than by name so a display
 * name can be corrected without silently detaching its grammar.
 */
export const REGION_LOCATIVES: Record<string, string> = {
  aragatsotn: 'Արագածոտնի մարզում',
  ararat: 'Արարատի մարզում',
  armavir: 'Արմավիրի մարզում',
  gegharkunik: 'Գեղարքունիքի մարզում',
  kotayk: 'Կոտայքի մարզում',
  lori: 'Լոռու մարզում',
  shirak: 'Շիրակի մարզում',
  syunik: 'Սյունիքի մարզում',
  tavush: 'Տավուշի մարզում',
  'vayots-dzor': 'Վայոց ձորի մարզում',
}

/**
 * Yerevan, then the ten marzes in `staticRegions` order.
 *
 * Derived from `staticRegions` rather than re-listed, so a marz cannot exist in
 * the footer and be missing here. `REGION_LOCATIVES` is the only hand-written
 * half, and `tests/vehicleTypeGeoPages.spec.ts` fails if a region ever lacks
 * one — which is what stops a new marz rendering «undefined» in an `<h1>`.
 */
export const VEHICLE_TYPE_GEOS: VehicleTypeGeo[] = [
  YEREVAN_GEO,
  ...staticRegions.map((region) => ({
    slug: region.slug,
    name: region.name,
    locative: REGION_LOCATIVES[region.slug] ?? `${region.name}ի մարզում`,
    translit: region.slug.replace(/-/g, ' '),
    translitAliases: [],
  })),
]

/** Resolve a `[geo]` route param. `undefined` for anything not on the list — a 404. */
export function findVehicleTypeGeo(slug: string): VehicleTypeGeo | undefined {
  return VEHICLE_TYPE_GEOS.find((geo) => geo.slug === slug)
}
