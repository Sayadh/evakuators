export interface AppConfig {
  port: number
  corsOrigins: string[]
  supabase: {
    url: string
    serviceRoleKey: string
    bucket: string
  }
}

export default (): AppConfig => ({
  port: Number(process.env.PORT ?? 3001),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET ?? '',
  },
})
