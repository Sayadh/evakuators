/**
 * Analytics abstraction over the site's external product analytics.
 *
 * Every caller is a component or composable that knows WHAT happened ("someone
 * pressed call on this driver") and nothing about which vendor receives it.
 * That mapping lives in `dispatch` alone, which is the whole point of the
 * indirection: swapping vendor, or adding one, is one edit here and zero edits
 * at the call sites.
 *
 * ## Where these events actually go
 *
 * `dispatch` pushes a gtag `event` command onto `window.dataLayer`, so every
 * event below reaches the GA4 property `nuxt.config.ts` configured as
 * `gtag.id`. Google Ads conversions ride that SAME stream: `AW-18328135826` is
 * linked to the GA4 property in Google's own UI and a GA4 event is imported
 * there as a conversion action. That is why this file names no `AW-` id and no
 * conversion label — the invariant "the Ads id is not a second id anywhere in
 * this codebase" is asserted in `utils/shouldLoadGtag.ts` and in CLAUDE.md, and
 * a `send_to: 'AW-.../label'` here would break it, adding a value that must
 * then be kept in sync by hand with Google's UI.
 *
 * ## Why `window.dataLayer` and not `useGtag()`
 *
 * The same reason `utils/trackMetaPixelContact.ts` reaches for `window.fbq`
 * directly: these are plain `utils/` modules called from click handlers, not
 * composables, so they must not require a Nuxt injection context to be present
 * at call time. The push below is exactly what `nuxt-gtag`'s own `gtag()`
 * helper does, so this is the module's mechanism rather than a parallel one.
 *
 * ## Why there is no gating here
 *
 * There is nothing left to gate. `window.dataLayer` exists only after
 * `plugins/gtag-gate.client.ts` has called `initialize()`, and that plugin is
 * the only caller: it already enforces the production id/hostname rule
 * (`shouldLoadGtag`), excludes `/admin` (`isAdminRoute`) and requires cookie
 * consent to be exactly `'accepted'`. If any gate refused, `dataLayer` is
 * `undefined` and the optional chain makes every call below a silent no-op —
 * a second copy of that logic here would only be one more thing to drift.
 */
/**
 * gtag.js's command queue.
 *
 * Declared here, not imported: `nuxt-gtag` does ship this exact global in its
 * `dist/runtime/globals.d.ts`, but that file is not part of the package's
 * published `types` entry and nothing in the project's type graph references
 * it, so `window.dataLayer` is otherwise untyped. Same house pattern as the
 * `fbq` declaration in `plugins/meta-pixel.client.ts` — the file that touches
 * a third-party global declares the subset of it that it touches.
 */
declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}

type AnalyticsPayload = Record<string, string | number | boolean | undefined>

/**
 * Pushes one gtag command onto the dataLayer.
 *
 * `arguments` rather than an array literal on purpose: gtag.js identifies its
 * commands by the `Arguments` object `gtag()` pushes, and a plain array is a
 * different shape to it. The parameters are named only so the call is
 * type-checked — the values that travel are the ones in `arguments`.
 */
function gtagCommand(_command: 'event', _eventName: string, _eventParams: AnalyticsPayload): void {
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer?.push(arguments)
}

function dispatch(event: string, payload?: AnalyticsPayload): void {
  if (import.meta.dev) {
    console.info(`[analytics] ${event}`, payload ?? {})
  }

  // `utils/` modules carry no client-only guarantee of their own, unlike the
  // `.client.ts` plugins — same guard, and same reason, as trackMetaPixelContact.
  if (!import.meta.client) return

  gtagCommand('event', event, payload ?? {})
}

export const trackPhoneClick = (towTruckSlug: string): void =>
  dispatch('phone_click', { towTruckSlug })

export const trackWhatsAppClick = (towTruckSlug: string): void =>
  dispatch('whatsapp_click', { towTruckSlug })

export const trackTelegramClick = (towTruckSlug: string): void =>
  dispatch('telegram_click', { towTruckSlug })

export const trackEmailClick = (towTruckSlug: string): void =>
  dispatch('email_click', { towTruckSlug })

export const trackTowTruckView = (towTruckSlug: string): void =>
  dispatch('tow_truck_view', { towTruckSlug })

export const trackLocationSearch = (regionSlug: string, citySlug?: string): void =>
  dispatch('location_search', { regionSlug, citySlug })

export const trackFilterApply = (activeFiltersCount: number): void =>
  dispatch('filter_apply', { activeFiltersCount })

export const trackRegistrationSubmit = (): void => dispatch('registration_submit')
