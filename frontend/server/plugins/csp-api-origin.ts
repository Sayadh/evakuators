import { apiOriginForCsp } from '../../utils/cspOrigins'

/**
 * Adds this environment's API origin to `connect-src` when the server boots.
 *
 * The rest of the Content-Security-Policy is static and lives in
 * `nuxt.config.ts`. This one directive cannot be, because the API hostname
 * differs per environment and is only known at runtime — production talks to
 * `api.evakuators.am`, staging to `staging-api.evakuators.am`, local dev to
 * `localhost:4002`, and all three run the *same build artifact*. Hardcoding one
 * of them meant staging's own CSP blocked every request it made.
 *
 * `nuxt-security:routeRules` is the module's own hook, fired once at startup
 * after it has read `runtimeConfig` and before it serves anything. Editing the
 * rules there means the header is *generated* correctly rather than
 * string-patched after the fact, so it stays consistent with whatever else the
 * module decides to emit.
 *
 * If the origin cannot be resolved the policy is left untouched. That is the
 * safe direction: a missing entry blocks requests loudly in the console, while
 * a guessed one would silently permit an origin nobody chose.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('nuxt-security:routeRules', (routeRules: Record<string, unknown>) => {
    const apiBaseUrl = useRuntimeConfig().public.apiBaseUrl as string | undefined
    const origin = apiOriginForCsp(apiBaseUrl)
    if (!origin) return

    // The global rule — the same `/**` key nuxt-security merges its own
    // defaults into. Narrower per-route rules inherit from it.
    const globalRule = routeRules['/**'] as
      | { headers?: { contentSecurityPolicy?: Record<string, string[] | boolean> } }
      | undefined

    const csp = globalRule?.headers?.contentSecurityPolicy
    if (!csp) return

    const connectSrc = csp['connect-src']
    if (!Array.isArray(connectSrc)) return
    if (connectSrc.includes(origin)) return

    csp['connect-src'] = [...connectSrc, origin]
  })
})
