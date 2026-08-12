import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Where the driver auth redirects live.
 *
 * The bug this guards against had no error message and no failed request: a
 * driver signed in, the session was stored, and the redirect to `/dashboard`
 * quietly did nothing — the login form just stayed on screen until the page was
 * reloaded by hand.
 *
 * The cause was `navigateTo` called from a page's `setup()`. On the client that
 * function has a branch (nuxt/dist/app/composables/router.js) which, when
 * `_processingMiddleware` is set, **returns the target route instead of
 * navigating** — that is the protocol by which middleware asks the router to
 * redirect. `_processingMiddleware` is set in `beforeEach` and deleted in
 * `afterEach`, so a `setup()` sitting on that boundary sometimes navigates and
 * sometimes silently does not.
 *
 * There is no Nuxt runtime here to click through (docs/testing.md — these are
 * pure-function tests), so this asserts the *shape*: the redirects are declared
 * as middleware, and the pages have not grown a `setup()` guard again. That is
 * the regression that would bring the silent failure back.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const read = (path: string): string => readFileSync(`${ROOT}${path}`, 'utf8')

/** Comments stripped: both files EXPLAIN the old pattern, and that must not match */
const code = (path: string): string =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')

describe('the middleware exists and is real middleware', () => {
  it('declares both guards with defineNuxtRouteMiddleware', () => {
    expect(code('middleware/driver-auth.ts')).toContain('defineNuxtRouteMiddleware')
    expect(code('middleware/driver-guest.ts')).toContain('defineNuxtRouteMiddleware')
  })

  it('returns the redirect rather than awaiting it', () => {
    // `return navigateTo(...)` is the middleware protocol — the router performs
    // the redirect. `await navigateTo(...)` inside middleware hits the branch
    // that returns without navigating, and the value is then thrown away.
    for (const file of ['middleware/driver-auth.ts', 'middleware/driver-guest.ts']) {
      expect(code(file), file).toMatch(/return navigateTo\(/)
      expect(code(file), file).not.toMatch(/await navigateTo\(/)
    }
  })

  it('sends each side to the other page', () => {
    expect(code('middleware/driver-auth.ts')).toContain("navigateTo('/login'")
    expect(code('middleware/driver-guest.ts')).toContain("navigateTo('/dashboard'")
  })

  it('does not decide anything on the server', () => {
    // The session is in localStorage, so the server cannot know. Guessing would
    // bounce every signed-in driver to /login on a hard refresh.
    for (const file of ['middleware/driver-auth.ts', 'middleware/driver-guest.ts']) {
      expect(code(file), file).toContain('import.meta.server')
    }
  })
})

describe('the pages use it', () => {
  it('declares the middleware on both pages', () => {
    expect(code('pages/dashboard.vue')).toContain("middleware: 'driver-auth'")
    expect(code('pages/login.vue')).toContain("middleware: 'driver-guest'")
  })

  it('has no setup-level redirect left in either page', () => {
    // The exact shape that failed: a top-level `if (...) await navigateTo(...)`
    // in <script setup>. It also made both pages async components, which is how
    // they ended up resolving inside Suspense at an unpredictable moment.
    for (const file of ['pages/dashboard.vue', 'pages/login.vue']) {
      const setup = code(file).split('</script>')[0] ?? ''
      expect(setup, `${file} regrew a setup() auth redirect`).not.toMatch(
        /^\s*if \([^)]*isLoggedIn[\s\S]{0,80}?navigateTo/m,
      )
    }
  })

  it('navigates with replace, so Back cannot land on a form that bounces', () => {
    // Signing in and signing out both replace: without it the browser's Back
    // button returns to a page whose own guard immediately redirects forward
    // again, which reads as the button being broken.
    expect(code('pages/login.vue')).toContain("navigateTo('/dashboard', { replace: true })")
    expect(code('pages/dashboard.vue')).toContain("navigateTo('/login', { replace: true })")
  })

  it('keeps the navigation out of the credential try/catch', () => {
    // A redirect that fails must not be reported as «Մուտք գործել չհաջողվեց» to
    // a driver whose session was in fact created.
    const setup = code('pages/login.vue').split('</script>')[0] ?? ''
    const tryBlock = setup.slice(setup.indexOf('try {'), setup.indexOf('finally'))
    expect(tryBlock).not.toContain('navigateTo')
  })
})
