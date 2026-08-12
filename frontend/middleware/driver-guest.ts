import { useDriverAuthStore } from '~/stores/driverAuth'

/**
 * Sends an already-signed-in driver straight past `/login`.
 *
 * The mirror of `driver-auth`, and middleware for the same reason — see that
 * file for why a `navigateTo` in a page's `setup()` can silently do nothing.
 *
 * `replace`, not `push`: the login form must not stay in history behind the
 * dashboard, or the browser's Back button lands a signed-in driver on a form
 * they have no reason to see, which then immediately redirects them forward
 * again.
 */
export default defineNuxtRouteMiddleware(() => {
  if (import.meta.server) return

  if (useDriverAuthStore().isLoggedIn) {
    return navigateTo('/dashboard', { replace: true })
  }
})
