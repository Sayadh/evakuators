import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_STORAGE_BUCKET: z.string().min(1, 'SUPABASE_STORAGE_BUCKET is required'),
  // Blocks every write (upload, remove) at SupabaseStorageService — see that
  // class for the full reasoning. String rather than z.coerce.boolean()
  // deliberately: coerce.boolean() treats the STRING "false" as truthy (any
  // non-empty string is), which would make "false" mean "true" — the exact
  // footgun this variable exists to prevent one level up. Compared literally
  // against 'true' in configuration.ts instead.
  SUPABASE_STORAGE_READ_ONLY: z.string().optional().default('false'),
  PORT: z.coerce.number().int().positive().default(4002),
  // Loopback by default: nginx is the only intended entry point (see main.ts).
  // Set 0.0.0.0 only if the API must be reachable without nginx.
  HOST: z.string().default('127.0.0.1'),
  CORS_ORIGIN: z.string().default('http://localhost:3002'),

  // Driver-facing bot — account linking, the one-time password handover, and
  // contact notices. Not part of logging in (that is phone + password).
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  TELEGRAM_BOT_USERNAME: z.string().min(1, 'TELEGRAM_BOT_USERNAME is required'),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1, 'TELEGRAM_WEBHOOK_SECRET is required'),
  // Restricts OUTBOUND driver-bot messages (passwords, link/contact notices)
  // to specific chat ids — see TelegramService.sendMessage(). Optional and
  // empty by default so production is unaffected; exists for an environment
  // that deliberately shares production's bot token (a staging deploy — see
  // docs/deployment.md § "Staging environment") but must never actually
  // message a real driver. Same shape and same "silently ignored" behaviour
  // as ADMIN_TELEGRAM_ALLOWED_CHAT_IDS below, applied to the driver bot's
  // sends instead of the admin bot's inbound handling.
  TELEGRAM_OUTBOUND_ALLOWED_CHAT_IDS: z.string().optional().default(''),
  DRIVER_JWT_SECRET: z.string().min(16, 'DRIVER_JWT_SECRET must be at least 16 characters'),

  // Admin panel login (see User model, role ADMIN)
  ADMIN_JWT_SECRET: z.string().min(16, 'ADMIN_JWT_SECRET must be at least 16 characters'),

  // Admin 2FA + registration notifications — a SEPARATE dedicated bot from
  // the driver one. Optional on purpose: unset means admin login stays
  // single-factor (see AdminTelegramService.isConfigured), so a fresh deploy
  // never fails to boot just because this hasn't been set up yet.
  ADMIN_TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  ADMIN_TELEGRAM_BOT_USERNAME: z.string().optional().default(''),
  ADMIN_TELEGRAM_WEBHOOK_SECRET: z.string().optional().default(''),
  // Comma-separated numeric chat ids — locks the admin bot to specific
  // Telegram accounts only. Empty = unrestricted (any valid link token works).
  ADMIN_TELEGRAM_ALLOWED_CHAT_IDS: z.string().optional().default(''),

  // Pepper for hashing analytics visitor ids (see AnalyticsVisitorKeyService).
  // Optional: falls back to DRIVER_JWT_SECRET, so no existing deployment needs
  // a new variable to start collecting analytics. Set it to a dedicated random
  // value if you'd rather the two concerns never share a secret. Changing it
  // makes every returning visitor look new from that point on.
  ANALYTICS_VISITOR_PEPPER: z.string().optional().default(''),

  // HMAC key for the `ipHash` on a privacy-consent record (see
  // ConsentRequestContextService). Optional, with the same DRIVER_JWT_SECRET
  // fallback as ANALYTICS_VISITOR_PEPPER above — a deploy that has not set it
  // records consent correctly, it just shares a secret with driver auth.
  // Rotating it only breaks "same IP as before" comparisons across the
  // rotation; it cannot affect who consented, to what, or when.
  PRIVACY_CONSENT_IP_SECRET: z.string().optional().default(''),

  // Road distances/times for the "nearest evacuator" search (OpenRouteService).
  //
  // Optional, and empty by default, for the same reason the admin Telegram bot
  // is: a deploy must not fail to boot because a key has not been obtained yet.
  // Empty means RouteMatrixService.isConfigured is false, no external call is
  // ever made, and the search runs permanently on PostGIS straight-line
  // distances with no times shown — which is the same fallback a routing
  // outage produces, so it is a path that gets exercised either way.
  ROUTE_MATRIX_API_KEY: z.string().optional().default(''),
  ROUTE_MATRIX_BASE_URL: z.string().optional().default('https://api.openrouteservice.org'),

  // Idram merchant credentials. Optional for the same reason the route-matrix
  // key is: an environment without them is one that cannot take payments yet,
  // which is a normal state (local, and production before the merchant
  // agreement is signed) rather than a misconfiguration worth refusing to boot
  // over. The RESULT endpoint checks for them itself and refuses callbacks
  // when they are missing — see IdramService.
  IDRAM_REC_ACCOUNT: z.string().optional().default(''),
  IDRAM_SECRET_KEY: z.string().optional().default(''),
})

export type Env = z.infer<typeof envSchema>

/** Fails fast on boot when the environment is misconfigured */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid environment configuration — ${issues}`)
  }
  return result.data
}
