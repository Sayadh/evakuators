/**
 * Whether a path is inside the admin panel.
 *
 * Pulled out as its own pure function — used by `plugins/gtag-admin-skip.client.ts`
 * to decide whether to load Google's gtag.js at all — so the actual boundary
 * decision has a direct test rather than only being reachable through a Nuxt
 * plugin this repo has no runtime to mount (`docs/testing.md`).
 *
 * Matches the same two patterns `routeRules` in `nuxt.config.ts` lists for the
 * SSR-off exception: `/admin` itself and everything under `/admin/`.
 */
export function isAdminRoute(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/')
}
