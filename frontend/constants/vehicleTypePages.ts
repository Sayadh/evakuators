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
  /** `<h1>` and the breadcrumb leaf — the full name, since it is read alone */
  heading: string
  title: string
  description: string
  /** Two paragraphs under the listing, for people and for search engines alike */
  intro: string[]
  faq: { question: string; answer: string }[]
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
  intro: [
    'Մանիպուլյատորով էվակուատորն ունի կռունկ, որով մեքենան կարելի է բարձրացնել ուղղահայաց՝ ' +
      'առանց քարշակելու։ Դա միակ լուծումն է, երբ մեքենան ընկել է ձորը, կանգնած է նեղ բակում, ' +
      'ստորգետնյա ավտոկայանատեղիում կամ այնպիսի տեղում, ուր սովորական հարթակը պարզապես չի մոտենա։',
    'Այս էջում հավաքված են բոլոր այն վարորդները, ովքեր նշել են, որ ունեն մանիպուլյատոր՝ ' +
      'անկախ նրանից, թե որ մարզում են աշխատում։ Ընտրեք ձեզ հարմարը, ստուգեք բեռնատարողությունը ' +
      'և զանգահարեք ուղիղ վարորդին՝ առանց միջնորդների։',
  ],
  faq: [
    {
      question: 'Ե՞րբ է պետք մանիպուլյատորով էվակուատոր',
      answer:
        'Երբ մեքենան հնարավոր չէ քաշել հարթակի վրա՝ ընկել է ձորը կամ փոսը, կանգնած է նեղ բակում ' +
        'կամ ստորգետնյա ավտոկայանատեղիում, կամ երբ պետք է բարձրացնել ծանր առարկա։',
    },
    {
      question: 'Որքա՞ն է արժե մանիպուլյատորով էվակուատորը',
      answer:
        'Գինը կախված է հեռավորությունից, աշխատանքի բարդությունից և ժամից։ Յուրաքանչյուր վարորդի ' +
        'քարտին նշված է մեկնարկային գինը. ճշգրիտ արժեքը ճշտեք զանգահարելիս։',
    },
    {
      question: 'Աշխատու՞մ են գիշերը',
      answer:
        'Վարորդների մի մասն աշխատում է 24/7։ Օգտագործեք «Աշխատում է 24/7» ֆիլտրը՝ միայն նրանց տեսնելու համար։',
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
  intro: [
    'Ծանր տեխնիկայի էվակուատորը նախատեսված է բեռնատարների, ավտոբուսների, միկրոավտոբուսների և ' +
      'շինարարական տեխնիկայի տեղափոխման համար։ Սովորական մարդատար էվակուատորի բեռնատարողությունը ' +
      'նման աշխատանքի համար բավարար չէ։',
  ],
  faq: [
    {
      question: 'Ի՞նչ քաշի տեխնիկա են տեղափոխում',
      answer:
        'Յուրաքանչյուր վարորդի քարտին նշված է առավելագույն բեռնատարողությունը։ Օգտագործեք ' +
        'բեռնատարողության ֆիլտրը՝ ձեր տեխնիկային համապատասխանողը գտնելու համար։',
    },
    {
      question: 'Կարո՞ղ են բարձրացնել շինարարական տեխնիկա',
      answer:
        'Այո, եթե տեխնիկան պետք է բարձրացնել, այլ ոչ թե քաշել, ձեզ պետք է նաև մանիպուլյատոր՝ ' +
        'տեսեք «Մանիպուլյատորով էվակուատոր» էջը։',
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
