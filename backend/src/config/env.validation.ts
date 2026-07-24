import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_STORAGE_BUCKET: z.string().min(1, 'SUPABASE_STORAGE_BUCKET is required'),
  PORT: z.coerce.number().int().positive().default(4002),
  CORS_ORIGIN: z.string().default('http://localhost:3002'),

  // Driver self-service login (Telegram OTP)
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  TELEGRAM_BOT_USERNAME: z.string().min(1, 'TELEGRAM_BOT_USERNAME is required'),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1, 'TELEGRAM_WEBHOOK_SECRET is required'),
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
