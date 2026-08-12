import { useDriverAuthStore } from '~/stores/driverAuth'

/**
 * Keeps signed-out visitors out of `/dashboard`.
 *
 * ## Why this is middleware and not two lines in the page's `setup()`
 *
 * It used to be exactly that — `if (!isLoggedIn) await navigateTo('/login')` at
 * the top of `pages/dashboard.vue`, with the mirror image in `pages/login.vue`.
 * That is not a supported place to redirect from, and it fails in a way that
 * looks like nothing happened at all.
 *
 * `navigateTo` has a branch (nuxt/dist/app/composables/router.js) that reads,
 * on the client:
 *
 *     if (import.meta.client && !isExternal && isProcessingMiddleware()) {
 *       return to          // ← returns the target. Does not navigate.
 *     }
 *
 * That branch is the middleware protocol: middleware `return`s a route and the
 * router performs the redirect. `_processingMiddleware` is set in the router's
 * `beforeEach` and deleted in its `afterEach`, so whether a `navigateTo` called
 * from a page's `setup()` actually navigates depends on which side of that
 * window the setup happens to run in — and a page with a top-level `await` is
 * an async component, so it resolves inside `<Suspense>`, whose timing relative
 * to `afterEach` is not something a page should be reasoning about.
 *
 * When it lands on the wrong side the call is a **silent no-op**: no error, no
 * navigation, the user stays where they were. Which is the bug this replaces —
 * logging in succeeded, the session was stored, and the redirect quietly did
 * nothing until the page was reloaded by hand.
 *
 * Removing those two guards also makes both pages non-async again, since the
 * top-level `await` was the only one in either file.
 *
 * ## Server-side
 *
 * The session lives in `localStorage` (see `stores/driverAuth.ts`), so the
 * server genuinely cannot know whether this visitor is signed in and must not
 * guess: redirecting on the server would send every signed-in driver to the
 * login page on a hard refresh. It falls through, the client's own run of this
 * middleware decides, and the page is `noindex` either way.
 */
export default defineNuxtRouteMiddleware(() => {
  if (import.meta.server) return

  // `init()` has already run by this point — `plugins/initStores.client.ts` is
  // a plugin, and plugins run before route middleware. Reading the store here
  // before hydration restored it is what would bounce a signed-in driver.
  if (!useDriverAuthStore().isLoggedIn) {
    return navigateTo('/login', { replace: true })
  }
})
