# Deployment

Single VPS, PM2 for process management, nginx as reverse proxy + TLS
termination. No containers, no CI/CD pipeline — deploys are manual `git
pull` + rebuild on the server. This doc is the practical runbook; see
`README.md` for the first-time setup checklist (Supabase project creation,
initial nginx/certbot setup, etc.) which isn't repeated here.

## Routine deploy (most common case)

```bash
git pull
cd frontend && npm install && npm run build
cd ../backend && npm install && npx prisma migrate deploy && npm run build
pm2 restart ecosystem.config.js
```

Run both sides even if only one changed — cheap insurance, and PM2 restart
is fast enough that there's no real cost to doing both every time.

## The "stale Prisma Client" trap

**If `backend/prisma/schema.prisma` changed, `npx prisma generate` must run
before `npm run build`, or the build fails with confusing TypeScript errors**
like `Property 'freeRoute' does not exist on type 'PrismaService'` or
`'someNewField' does not exist in type 'XWhereInput'`. `npx prisma migrate
deploy` applies pending SQL migrations to the database, but it does **not**
regenerate the TypeScript client — that's a separate step
(`npx prisma generate`), easy to forget because most of the time you don't
need to think about it explicitly (`npm install` doesn't trigger it either).
Full safe sequence after a schema change:

```bash
cd backend
git pull
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 restart evakuators-backend
```

This has bitten this project's deploy process more than once — if a build
error mentions a Prisma-generated type that "should" exist, this is the
first thing to check, before assuming the schema change itself is wrong.

## PM2

`ecosystem.config.js` (repo root) defines both processes:

- `evakuators-frontend` — `cwd: frontend/`, runs `.output/server/index.mjs`
  (Nitro's node-server output), env sets `PORT=3002`, `HOST=127.0.0.1`, and
  `NUXT_PUBLIC_API_BASE_URL` directly in the ecosystem file (not `.env`) —
  if you need to change the production API base URL, edit this file, not a
  frontend `.env` (the frontend doesn't read a `.env` file in production the
  way `backend/.env` is read; PM2's `env` block is what's injected).
- `evakuators-backend` — `cwd: backend/`, runs `dist/main.js`, only sets
  `NODE_ENV: production` here — every other secret (`DATABASE_URL`,
  `SUPABASE_*`, `PORT`, JWT secrets, Telegram config) comes from
  `backend/.env`, deliberately kept out of the (version-controlled)
  ecosystem file.

```bash
pm2 start ecosystem.config.js   # first time
pm2 restart ecosystem.config.js  # after a deploy
pm2 logs evakuators-backend --lines 50 --nostream   # check recent logs
pm2 save && pm2 startup   # survive a server reboot
```

## nginx

`nginx/evakuators.am.conf` is the reference config — routes by hostname:
`evakuators.am` (+ `www`) → frontend on `127.0.0.1:3002`,
`api.evakuators.am` → backend on `127.0.0.1:4002`. TLS via certbot
(`certbot --nginx -d evakuators.am -d www.evakuators.am -d api.evakuators.am`).
Both `AdminJwtGuard` and `DriverJwtGuard` enforce auth in the NestJS app
itself, not via nginx — auth still works correctly even if nginx config
changes or is bypassed in some edge case.

## Telegram webhook registration

One-time (or whenever the API domain changes), **not** part of the routine
deploy:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://api.evakuators.am/api/v1/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Remember: this webhook URL is **global for the whole bot** — see
`docs/auth-and-security.md` and `docs/local-development.md` for why this
matters when debugging Telegram-related reports (they might be an artifact
of testing against the wrong environment, not a real bug).

### Admin bot (2FA + new-registration alerts) — optional, separate bot

If `ADMIN_TELEGRAM_BOT_TOKEN` etc. are set (see `docs/auth-and-security.md`),
this is a **different bot** than the driver one above, with its own webhook:

```bash
curl "https://api.telegram.org/bot<ADMIN_TELEGRAM_BOT_TOKEN>/setWebhook?url=https://api.evakuators.am/api/v1/admin-telegram/webhook&secret_token=<ADMIN_TELEGRAM_WEBHOOK_SECRET>"
```

Then, per admin account that should get 2FA + notifications:

```bash
cd backend && npm run admin:telegram-link -- admin@evakuators.am
```

and tap the printed link. Skippable entirely — leave the `ADMIN_TELEGRAM_*`
vars blank and admin login stays single-factor (password only).

## Environment variables reference (backend)

All validated at boot by `backend/src/config/env.validation.ts` (zod) except
`FRONTEND_URL`, which has a code-level default and isn't part of the zod
schema — a typo there won't fail startup, it'll just silently produce a
wrong link in Telegram messages.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `SUPABASE_URL` | yes | Storage only — never DB/Auth |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | |
| `SUPABASE_STORAGE_BUCKET` | yes | Must be a **public** bucket |
| `PORT` | no, default `4002` | Never `3002` |
| `CORS_ORIGIN` | no, default `http://localhost:3002` | Comma-separated; a prod-only value silently blocks local dev — see `docs/local-development.md` |
| `FRONTEND_URL` | no, default `https://evakuators.am` | Used to build the "Login" button link in Telegram messages; not zod-validated |
| `TELEGRAM_BOT_TOKEN` | yes | |
| `TELEGRAM_BOT_USERNAME` | yes | Without the `@` |
| `TELEGRAM_WEBHOOK_SECRET` | yes | Random string, checked with `timingSafeEqual` against Telegram's header |
| `DRIVER_JWT_SECRET` | yes, min 16 chars | Also used as the OTP hashing pepper |
| `ADMIN_JWT_SECRET` | yes, min 16 chars | Deliberately separate from `DRIVER_JWT_SECRET`; also the admin OTP hashing pepper |
| `ADMIN_TELEGRAM_BOT_TOKEN` | no, default `''` | Separate bot from `TELEGRAM_BOT_TOKEN` — admin 2FA + registration alerts. Blank = feature off, login stays single-factor |
| `ADMIN_TELEGRAM_BOT_USERNAME` | no, default `''` | Without the `@` |
| `ADMIN_TELEGRAM_WEBHOOK_SECRET` | no, default `''` | Same `timingSafeEqual` pattern as `TELEGRAM_WEBHOOK_SECRET` |
| `ADMIN_TELEGRAM_ALLOWED_CHAT_IDS` | no, default `''` | Comma-separated chat ids; anyone else is silently ignored by the bot. Blank = unrestricted |

## Environment variables reference (frontend)

Set via PM2's `env` block in production, or a local `.env` for dev:

| Variable | Notes |
| --- | --- |
| `NUXT_PUBLIC_API_BASE_URL` | Full backend URL including `/api/v1`. Empty = mock mode (see `docs/architecture.md`) |
| `PORT` | Reserved `3002` |
