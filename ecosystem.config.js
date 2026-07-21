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
      name: 'evakuators-frontend',
      cwd: './frontend',
      script: '.output/server/index.mjs',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NUXT_PUBLIC_API_BASE: 'https://api.evakuators.am',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
    {
      name: 'evakuators-backend',
      cwd: './backend',
      script: 'dist/main.js',
      // Secrets (DATABASE_URL, SUPABASE_*) come from backend/.env — never from this file
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
  ],
}
