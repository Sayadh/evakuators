/**
 * Which site design is on (2026-11-18), switched from /admin:
 *
 * - 1 — as designed: «Ազատ երթուղիներ» and «Գտնել մոտակա էվակուատորները»
 *   wherever they appear, our number as an outlined button.
 * - 2 — those two hidden EVERYWHERE (homepage hero, the listing pages'
 *   «nearest» banners, the nav, /links) and our number made the main call to
 *   action: a big gold button in the hero, «call us» banners where the
 *   «nearest» ones were, a larger number in the header and the floating call
 *   button on every page on phones. /free-routes and /evakuator stay
 *   reachable by URL.
 *
 * One `useState`, filled once per request by plugins/site-settings.ts during
 * SSR and carried to the browser in the payload — so the server and the
 * browser render the same design (no hydration mismatch, no flash).
 */
export type SiteDesign = 1 | 2

export function useSiteDesignState() {
  return useState<SiteDesign>('site-design', () => 1)
}

export function useSiteDesign() {
  const state = useSiteDesignState()
  return {
    design: computed(() => state.value),
    /** The phone-first design: the two discovery buttons are hidden, the number leads */
    phoneFirst: computed(() => state.value === 2),
  }
}
