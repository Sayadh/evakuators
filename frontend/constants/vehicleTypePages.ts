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
  /**
   * `<meta name="description">` only — these pages carry no on-page prose.
   *
   * They deliberately show the drivers and nothing else: someone who lands here
   * has already said what they need, the URL IS the filter, and anything above
   * the cards is one more thing between them and a phone number. That makes
   * this string the whole of what a search result shows under the title, so it
   * has to stand on its own.
   */
  description: string
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
