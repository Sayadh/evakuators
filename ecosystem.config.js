/**
 * PM2 process file for production.
 *
 *   pm2 start ecosystem.config.js
 *   pm2 save && pm2 startup
 *
 * Build both apps first (see README.md).
 */
module.exports = {
  apps: [
    {
      // 3002 is reserved for this frontend — 4002 is the backend, never swap them
      name: 'evakuators-frontend',
      cwd: './frontend',
      script: '.output/server/index.mjs',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        HOST: '127.0.0.1',
        NUXT_PUBLIC_API_BASE_URL: 'https://api.evakuators.am/api/v1',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
    {
      // Listens on 4002 (PORT in backend/.env) — 3002 is the frontend, never swap them
      name: 'evakuators-backend',
      cwd: './backend',
      script: 'dist/main.js',
      // Secrets (DATABASE_URL, SUPABASE_*, PORT) come from backend/.env — never from this file
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
  ],
}
