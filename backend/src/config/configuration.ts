export interface AppConfig {
  port: number
  corsOrigins: string[]
  frontendUrl: string
  supabase: {
    url: string
    serviceRoleKey: string
    bucket: string
  }
  telegram: {
    botToken: string
    botUsername: string
    webhookSecret: string
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
}

export default (): AppConfig => ({
  // 4002 is reserved for this backend — 3002 is the Evakuators frontend, never swap them
  port: Number(process.env.PORT ?? 4002),
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
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME ?? '',
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
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
  driverJwtSecret: process.env.DRIVER_JWT_SECRET ?? '',
  adminJwtSecret: process.env.ADMIN_JWT_SECRET ?? '',
})
