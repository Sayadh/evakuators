export interface AppConfig {
  port: number
  /**
   * Interface to bind. Defaults to loopback so nginx is the only way in — see
   * the comment on `app.listen()` in main.ts for why that matters.
   */
  host: string
  corsOrigins: string[]
  frontendUrl: string
  supabase: {
    url: string
    serviceRoleKey: string
    bucket: string
    /**
     * When true, `SupabaseStorageService` refuses every upload/remove call
     * before it reaches the network — see that class for why. False (the
     * default) everywhere except a deployment deliberately configured this
     * way, e.g. staging sharing production's bucket for read-only display
     * (see docs/deployment.md § "Staging environment").
     */
    writesDisabled: boolean
  }
  telegram: {
    botToken: string
    botUsername: string
    webhookSecret: string
    /**
     * When non-empty, `TelegramService.sendMessage()` sends only to these
     * chat ids and silently skips everyone else — see that method for the
     * full reasoning. Empty (the default everywhere except a deliberately
     * configured staging deploy) means unrestricted, i.e. today's behaviour.
     */
    outboundAllowedChatIds: string[]
  }
  /**
   * A SEPARATE, dedicated Telegram bot used only for admin 2FA login codes
   * and new-registration notifications — deliberately not the same bot/token
   * as `telegram` above (see docs/auth-and-security.md). Fully optional: all
   * fields default to '' and AdminTelegramService no-ops when unconfigured,
   * so admin login just stays single-factor until this is set up.
   */
  adminTelegram: {
    botToken: string
    botUsername: string
    webhookSecret: string
    /**
     * Numeric Telegram chat ids allowed to interact with the admin bot at
     * all (link, /start, everything). Empty = unrestricted (matches the
     * rest of this feature's "optional, off by default" convention) — set
     * it to lock the bot down to one specific person's Telegram account
     * regardless of whether they happen to have a valid link token.
     */
    allowedChatIds: string[]
  }
  driverJwtSecret: string
  adminJwtSecret: string
  /**
   * Pepper for hashing visitor ids in the analytics module
   * (see AnalyticsVisitorKeyService). Optional in the environment: when unset
   * it falls back to `driverJwtSecret`, which is already required and
   * length-validated — so analytics works on an existing deployment with no new
   * env var, while still allowing a dedicated one. Note the fallback is only a
   * convenience: nothing about driver auth depends on this value, and driver
   * passwords are bcrypt-hashed with no pepper at all.
   *
   * Rotating it is a deliberate, destructive act: every stored visitorKey
   * becomes unmatchable, so every returning visitor is counted as new from that
   * moment on (historical aggregates are unaffected — they hold no keys).
   */
  analyticsVisitorPepper: string
  /**
   * HMAC key for hashing the client IP on a privacy-consent record — see
   * `ConsentRequestContextService`.
   *
   * Optional in the environment for the same reason and with the same fallback
   * as `analyticsVisitorPepper` above: an existing deployment must not fail to
   * boot, or silently stop recording consent, because a new variable has not
   * been set yet. Set a dedicated random value if you would rather the two
   * concerns never share a secret.
   *
   * Rotating it is less destructive than rotating the analytics pepper, but not
   * free: past `ipHash` values stop matching newly computed ones, so "same
   * address as last time" comparisons no longer span the rotation. The consents
   * themselves — who agreed, to what, when — are entirely unaffected.
   */
  privacyConsentIpSecret: string
  /**
   * Road distance/time provider for the "nearest evacuator" search
   * (OpenRouteService — see RouteMatrixService for why that one).
   *
   * Fully optional: an empty `apiKey` means no external call is ever made and
   * the search shows PostGIS straight-line distances with no estimated times,
   * exactly as it does during a routing outage. So a deploy without a key is a
   * working deploy with a smaller answer, not a broken one.
   */
  routeMatrix: {
    apiKey: string
    baseUrl: string
  }
}

const driverJwtSecret = (): string => process.env.DRIVER_JWT_SECRET ?? ''

export default (): AppConfig => ({
  // 4002 is reserved for this backend — 3002 is the Evakuators frontend, never swap them
  port: Number(process.env.PORT ?? 4002),
  host: process.env.HOST ?? '127.0.0.1',
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3002')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  // Used to build the "Login" button link sent in Telegram messages.
  frontendUrl: (process.env.FRONTEND_URL ?? 'https://evakuators.am').replace(/\/$/, ''),
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET ?? '',
    // Literal comparison, not Boolean(...) — see the env.validation.ts comment
    // on SUPABASE_STORAGE_READ_ONLY for why that distinction matters here.
    writesDisabled: process.env.SUPABASE_STORAGE_READ_ONLY === 'true',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME ?? '',
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
    outboundAllowedChatIds: (process.env.TELEGRAM_OUTBOUND_ALLOWED_CHAT_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  },
  adminTelegram: {
    botToken: process.env.ADMIN_TELEGRAM_BOT_TOKEN ?? '',
    botUsername: process.env.ADMIN_TELEGRAM_BOT_USERNAME ?? '',
    webhookSecret: process.env.ADMIN_TELEGRAM_WEBHOOK_SECRET ?? '',
    allowedChatIds: (process.env.ADMIN_TELEGRAM_ALLOWED_CHAT_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  },
  driverJwtSecret: driverJwtSecret(),
  adminJwtSecret: process.env.ADMIN_JWT_SECRET ?? '',
  analyticsVisitorPepper: process.env.ANALYTICS_VISITOR_PEPPER || driverJwtSecret(),
  privacyConsentIpSecret: process.env.PRIVACY_CONSENT_IP_SECRET || driverJwtSecret(),
  routeMatrix: {
    apiKey: process.env.ROUTE_MATRIX_API_KEY ?? '',
    // Trailing slash stripped so the service can concatenate a path without
    // producing a double slash — same treatment frontendUrl gets above.
    baseUrl: (process.env.ROUTE_MATRIX_BASE_URL ?? 'https://api.openrouteservice.org').replace(
      /\/$/,
      '',
    ),
  },
})
