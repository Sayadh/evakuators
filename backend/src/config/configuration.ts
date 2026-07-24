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
  driverJwtSecret: process.env.DRIVER_JWT_SECRET ?? '',
  adminJwtSecret: process.env.ADMIN_JWT_SECRET ?? '',
})
