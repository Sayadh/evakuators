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
        // What the BROWSER calls — must stay the public hostname.
        NUXT_PUBLIC_API_BASE_URL: 'https://api.evakuators.am/api/v1',
        // What SSR calls. Straight to the backend on loopback: skips a
        // pointless nginx + TLS hop per render, and — the actual reason this
        // exists — keeps server-rendered pages out of the public per-IP rate
        // limit, which every visitor would otherwise share through this one
        // process. See backend/src/common/ssr-aware-throttler.guard.ts.
        NUXT_INTERNAL_API_BASE_URL: 'http://127.0.0.1:4002/api/v1',
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
