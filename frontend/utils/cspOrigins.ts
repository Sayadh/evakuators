/**
 * The API origin the browser is allowed to talk to, derived at **runtime**.
 *
 * ## Why this cannot be a constant in nuxt.config.ts
 *
 * `connect-src` was hardcoded to `https://api.evakuators.am`, which is correct
 * on production and wrong everywhere else. Staging calls
 * `https://staging-api.evakuators.am`, so every fetch it made was refused by
 * its own Content-Security-Policy — the site rendered and then did nothing.
 *
 * The obvious fix, reading `process.env.NUXT_PUBLIC_API_BASE_URL` inside
 * `nuxt.config.ts`, is a trap: that file is evaluated when `npm run build`
 * runs, and the variable is not set then. PM2 supplies it when the process
 * *starts* (see `ecosystem.config.js`). A build-time read would quietly produce
 * an empty origin in both environments and look like it worked.
 *
 * So the value is resolved from `runtimeConfig.public.apiBaseUrl` by a Nitro
 * plugin at boot — see `server/plugins/csp-api-origin.ts`.
 *
 * Note this deliberately uses the **public** base URL, not
 * `internalApiBaseUrl`. `connect-src` governs requests the browser makes;
 * SSR's loopback address is never one of them, and adding it would publish an
 * internal address in a response header for no benefit.
 */

/**
 * `https://staging-api.evakuators.am/api/v1` → `https://staging-api.evakuators.am`
 *
 * Returns `null` — never a partial or guessed value — when there is nothing
 * usable. An empty base URL is the documented "mock mode" switch
 * (`isApiEnabled()`, see docs/architecture.md), in which case the browser makes
 * no API calls at all and `connect-src` needs no entry.
 *
 * Only http(s) is accepted. A `connect-src` entry is a permission, so anything
 * unparseable or of another scheme is dropped rather than passed through.
 */
export function apiOriginForCsp(apiBaseUrl: string | undefined | null): string | null {
  if (!apiBaseUrl) return null

  try {
    const { origin, protocol } = new URL(apiBaseUrl)
    if (protocol !== 'https:' && protocol !== 'http:') return null
    return origin
  } catch {
    return null
  }
}
