/**
 * Fires the Meta Pixel's own `Contact` standard event — "a telephone, SMS,
 * email, chat or other type of contact between a customer and your
 * business" (Meta's own definition) — for the WhatsApp button in
 * `components/tow-truck/TowTruckContactActions.vue`.
 *
 * WhatsApp only. Phone clicks are NOT tracked here: `plugins/meta-pixel.
 * client.ts` already tracks every `tel:` link click itself, through a
 * single document-level listener (see that file's `trackContact`), so a
 * second call from here would double-count the same click as two separate
 * `Contact` events. WhatsApp's link is a `https://wa.me/...` href, not
 * `tel:`, so it falls outside that listener and still needs firing here.
 *
 * No gating logic here — none is needed. Every gate that decides whether
 * the Pixel exists at all (production hostname, not `npm run dev`, not
 * `/admin`, cookie consent accepted) already lives in
 * `plugins/meta-pixel.client.ts`, the only place `window.fbq` ever gets
 * installed. If any of those gates failed, `window.fbq` is simply
 * `undefined` here and this call is a no-op — there is nothing left for a
 * second copy of that logic to re-check, and nothing here to keep in sync
 * with it. `import.meta.client` is the one guard this file still needs on
 * its own: unlike the click handlers that call it, this is a plain
 * `utils/` module (not `.client.ts`), so it has no built-in guarantee
 * against ever running server-side.
 */
export function trackMetaPixelContact(towTruckSlug: string): void {
  if (!import.meta.client) return
  window.fbq?.('track', 'Contact', { contact_type: 'whatsapp', content_name: towTruckSlug })
}
