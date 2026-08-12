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
