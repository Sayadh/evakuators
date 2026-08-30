/**
 * Whether a `PageView` should fire for `path`, given the last path a
 * `PageView` was already sent for this page session.
 *
 * Pulled out as its own pure function — used by
 * `plugins/meta-pixel.client.ts` — so the dedup rule has a direct test
 * rather than only being reachable through a Nuxt plugin this repo has no
 * runtime to mount (`docs/testing.md`).
 *
 * `null` means "nothing sent yet this page session", which is always a fresh
 * `PageView` — that is what covers the initial load. Anything else is a
 * plain "did the path actually change" check: Vue Router can re-trigger a
 * route watcher without the path changing (a query-only navigation, for
 * instance), and that must never double-count as a second view of the same
 * page.
 */
export function shouldTrackPixelPageView(lastPath: string | null, path: string): boolean {
  return lastPath !== path
}
