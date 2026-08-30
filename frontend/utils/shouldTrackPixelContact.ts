/**
 * Whether a `Contact` event should fire for `key`, given the last key a
 * `Contact` event was already sent for this page session.
 *
 * Pulled out as its own pure function — used by `plugins/meta-pixel.client.
 * ts` — so the dedup rule has a direct test rather than only being reachable
 * through a Nuxt plugin this repo has no runtime to mount
 * (`docs/testing.md`). Same shape and same reason as
 * `shouldTrackPixelPageView`.
 *
 * The key is source + href, so two different drivers on one page are two
 * genuine contacts, while a double-tap on one driver's button — common on
 * mobile where the `tel:` handoff feels unresponsive — stays one.
 */
export function shouldTrackPixelContact(lastKey: string | null, key: string): boolean {
  return lastKey !== key
}
