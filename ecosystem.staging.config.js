/**
 * PM2 process file for the STAGING environment.
 *
 *   pm2 start ecosystem.staging.config.js
 *   pm2 save
 *
 * Deliberately a SEPARATE file from ecosystem.config.js, not staging entries
 * added into it. `pm2 restart ecosystem.config.js` (the routine production
 * deploy command in docs/deployment.md) must only ever touch the two
 * production processes — mixing staging into the same file would mean a
 * production deploy restarts staging too, and a copy/paste mistake in one
 * environment's block risks the other's.
 *
 * Build both apps first, from staging's OWN checkout (see docs/deployment.md
 * § "Staging environment" — staging lives in a separate git clone from
 * production, e.g. /var/www/evakuators-staging, precisely so that building
 * staging can never leave production's `.output`/`dist` in a half-built
 * state mid-deploy).
 */
module.exports = {
  apps: [
    {
      // 3003 is reserved for staging's frontend — 4003 is staging's backend.
      // One above production's 3002/4002. Never let these collide with the
      // production ports, and never point this at production's ports "to
      // test something quickly" — see the file-level comment above.
      name: 'evakuators-frontend-staging',
      cwd: './frontend',
      script: '.output/server/index.mjs',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
        HOST: '127.0.0.1',
        // What the BROWSER calls — staging's own public hostname, never the
        // production API. Pointing this at api.evakuators.am would mean
        // staging silently reads and writes production's real data.
        NUXT_PUBLIC_API_BASE_URL: 'https://staging-api.evakuators.am/api/v1',
        // Straight to staging's own backend over loopback — same reasoning
        // as production's NUXT_INTERNAL_API_BASE_URL (skips a pointless
        // nginx+TLS hop per SSR render, keeps server-rendered pages out of
        // the public per-IP rate limit).
        NUXT_INTERNAL_API_BASE_URL: 'http://127.0.0.1:4003/api/v1',
        // Deliberately empty, not production's id copied over. Production's
        // real G-HEN3RVMTRG (and, through it, Google Ads conversion tracking
        // AW-18328135826 — see the comment in ecosystem.config.js) must never
        // receive a hit from anywhere but evakuators.am; `shouldLoadGtag()`
        // (frontend/utils/shouldLoadGtag.ts) refuses to load that specific id
        // from any other hostname even if this line is ever set wrong. If
        // staging analytics is genuinely needed, put a SEPARATE GA4
        // property's test id here — never production's.
        NUXT_PUBLIC_GTAG_ID: '',
        // Same reasoning as NUXT_PUBLIC_GTAG_ID right above, for the Meta
        // Pixel: deliberately empty, not production's id copied over.
        // `shouldLoadPixel()` (frontend/utils/shouldLoadPixel.ts) refuses
        // production's real pixel id from any hostname but evakuators.am
        // even if this line is ever set wrong. A separate test pixel id can
        // go here if staging tracking is genuinely needed — never
        // production's.
        NUXT_PUBLIC_META_PIXEL_ID: '',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
    {
      // Listens on 4003 (PORT in this checkout's backend/.env) — never 3003
      // or either production port.
      name: 'evakuators-backend-staging',
      cwd: './backend',
      script: 'dist/main.js',
      // Secrets (DATABASE_URL, SUPABASE_*, PORT, JWT secrets, Telegram
      // config) come from backend/.env in THIS checkout — never from this
      // file, and never copied from production's .env verbatim except where
      // docs/deployment.md explicitly says to (the Telegram and Supabase
      // values, by deliberate choice — see that section for why DATABASE_URL
      // and the JWT secrets must NOT be copied the same way).
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
  ],
}
