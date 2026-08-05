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

## Staging environment

A second, full copy of the stack on the same VPS — `staging.evakuators.am` /
`staging-api.evakuators.am`, ports `3003`/`4003` (one above production's
`3002`/`4002`) — so a change can be built, deployed and clicked through
against a real backend and a real (but separate) database before it ever
reaches `evakuators.am`. Not a second server: no new cost, and everything in
`docs/local-development.md` about Postgres/PM2/nginx already applies here,
just against a second checkout.

**Two things staging deliberately does NOT get, by explicit choice, not
oversight:**

- **Its own Telegram bot.** Telegram gives one bot exactly one webhook,
  globally (see `docs/local-development.md` § "one webhook, globally"), and
  that webhook stays pointed at production. Staging's `.env` holds the same
  bot token as production, but its backend will never actually *receive* a
  Telegram update — driver OTP login, admin 2FA, and new-registration
  Telegram notifications are all untestable on staging, exactly like local
  development already is. If a change specifically touches one of those
  flows, verify it against production directly, or accept the gap.
- **Its own Supabase Storage bucket.** Staging uses production's bucket.
  Test image uploads on staging land in the same place real driver photos
  do. Acceptable for now — revisit if that ever causes a real problem
  (stray test images turning up somewhere they shouldn't, storage costs,
  etc.).

Everything else — the database, both JWT secrets, the analytics pepper — is
**staging's own**, generated fresh, never copied from production. See the
comments in `backend/.env.staging.example` for exactly which variables are
shared on purpose and which must not be.

### One-time setup

```bash
# Separate checkout, not a subdirectory of production's — building staging
# must never touch production's .output/dist mid-deploy.
git clone <repo-url> /var/www/evakuators-staging
cd /var/www/evakuators-staging

# A separate database on the SAME Postgres instance — full data isolation,
# no new server. The `evakuators` role already exists (production created
# it) — this only needs a new database owned by it.
#
# Run as the `postgres` OS user, not root/your login: `psql postgres` with
# no -U tries to peer-auth as whatever OS user is running it, and Postgres
# has no role by that name unless it happens to be `postgres` or
# `evakuators` themselves. On a VPS shell you are usually root, and there is
# no Postgres role called `root` — that's the
# `FATAL: role "root" does not exist` you'll see if you skip `sudo -u postgres`.
sudo -u postgres psql -c "CREATE DATABASE evakuators_staging OWNER evakuators;"

cp backend/.env.staging.example backend/.env
# Fill in DATABASE_URL's password, copy SUPABASE_*/TELEGRAM_* from
# production's backend/.env verbatim, and generate FRESH values for
# DRIVER_JWT_SECRET / ADMIN_JWT_SECRET / ANALYTICS_VISITOR_PEPPER
# (openssl rand -hex 32) — see the file's own comments for which is which.

cd frontend && npm install && npm run build
cd ../backend && npm install && npx prisma generate && npx prisma migrate deploy && npm run build

pm2 start ecosystem.staging.config.js
pm2 save
```

Then, on the nginx/DNS side: point `staging.evakuators.am` and
`staging-api.evakuators.am` at the VPS, install `nginx/staging.evakuators.am.conf`,
and run
`certbot --nginx -d staging.evakuators.am -d staging-api.evakuators.am`. See
that file's own comments for why it deliberately mirrors
`nginx/evakuators.am.conf`'s structure, and for the `X-Robots-Tag` header
that keeps the whole staging site out of search results (unlike production,
where individual pages opt into `noindex` one at a time).

### Routine workflow — staging before production

```bash
# 1. Deploy to staging first
cd /var/www/evakuators-staging
git pull
cd frontend && npm install && npm run build
cd ../backend && npm install && npx prisma generate && npx prisma migrate deploy && npm run build
pm2 restart ecosystem.staging.config.js

# 2. Click through staging.evakuators.am — the exact change, against a real
#    backend and database, before production sees it.

# 3. Only once staging looks right, deploy the SAME commit to production —
#    the routine deploy at the top of this doc, unchanged, from
#    /var/www/evakuators (production's own checkout).
```

The two checkouts (`/var/www/evakuators-staging` and `/var/www/evakuators`)
are independent working directories on the same clone of the same repo —
`git pull` in one never touches the other, and a build failure on staging
never blocks or affects the running production processes. `pm2 restart
ecosystem.config.js` still only ever touches the two production processes;
`pm2 restart ecosystem.staging.config.js` only ever touches staging's — see
the comment at the top of `ecosystem.staging.config.js` for why that split
is deliberate rather than one file with four apps in it.

## Why the API binds loopback, and why `trust proxy` matters

Two settings in `backend/src/main.ts` that only make sense together, and both
were wrong before:

**`app.set('trust proxy', 1)`.** nginx forwards the real client address in
`X-Forwarded-For` (`$proxy_add_x_forwarded_for`), but Express ignores that header
unless told to trust it. Without it, `req.ip` is `127.0.0.1` — nginx's own
address — for every request in the world, and `ThrottlerGuard` keys its buckets
on `req.ip`. So **every `@Throttle` in the app was a single global cap shared by
the entire internet**: five failed logins from one person returned 429 to the
next login from anyone else. Any script could lock all real users out of login,
review submission, image upload and analytics tracking, and every IP in the logs
was useless.

`1`, not `true`: Express then takes the entry exactly one hop from the right of
the XFF chain — the one nginx appended itself. Verified that a client forging
`X-Forwarded-For: 1.2.3.4` gets the same bucket as before (the forged value is
pushed left and ignored), while a genuinely different client gets its own.
**If a CDN (Cloudflare etc.) is ever put in front of nginx, this must become
`2`** — otherwise all of that CDN's users collapse into one bucket again.

**`HOST=127.0.0.1` (the new default).** The API used to listen on `*:4002`, so on
the VPS it answered on `http://<server-ip>:4002/api/v1` — bypassing nginx, and
therefore TLS, and therefore also the `X-Forwarded-For` header the throttler now
depends on. Binding loopback closes that path; the frontend already did this via
PM2's `HOST`.

## Database backups

**There is no automatic backup until you install one — nothing does it for
you.** Postgres lives on the same single VPS as the app, so a disk failure or a
bad `DELETE` loses every registration, review and analytics counter with no way
back.

`scripts/backup-db.sh` is in the repo and ready to run:

```bash
chmod +x scripts/backup-db.sh
crontab -e
```

```cron
30 3 * * * /srv/evakuators/scripts/backup-db.sh >> /var/log/evakuators-backup.log 2>&1
```

It reads `DATABASE_URL` from `backend/.env` (so credentials stay in one place),
dumps to `/var/backups/evakuators/db-<date>.sql.gz`, verifies the gzip, and
prunes dumps older than 14 days. Two details that matter:

- It writes to `.partial` and renames only on success. A cron job killed halfway
  through would otherwise leave a truncated file that looks like a valid backup
  until the day someone tries to restore it.
- Pruning runs **last**, so a failed dump never deletes the previous good copy.

Tunables via the environment: `BACKUP_DIR`, `RETENTION_DAYS`, `ENV_FILE`,
`OFFSITE_CMD`.

### Two things the script cannot do for you

1. **Get the backup off this machine.** A dump on the same disk as the database
   does not survive the failure it exists for. Set `OFFSITE_CMD` to anything that
   takes the dump path as `$1` — the script warns on every run until you do:
   ```cron
   30 3 * * * OFFSITE_CMD='rclone copy "$1" remote:evakuators-backups' /srv/evakuators/scripts/backup-db.sh >> /var/log/evakuators-backup.log 2>&1
   ```
2. **Prove a restore works.** An untested backup is a guess. Do this once and
   note how long it takes:
   ```bash
   createdb evakuators_restore_test
   gunzip -c /var/backups/evakuators/db-YYYY-MM-DD-HHMM.sql.gz | psql evakuators_restore_test
   psql evakuators_restore_test -c 'SELECT count(*) FROM "TowTruck";'
   dropdb evakuators_restore_test
   ```

Supabase Storage (the tow truck photos) is a separate system with its own
retention — a Postgres dump contains the rows that point at the images, not the
images.

## Log rotation

PM2 writes stdout/stderr to `~/.pm2/logs/*.log` and never truncates them, so a
long-running server slowly fills its disk with the request log:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

## Scheduled jobs

Four crons run inside the backend process (`ScheduleModule.forRoot()`), all
logging only when they actually changed something:

| Job | Schedule | What it does |
| --- | --- | --- |
| `FreeRoutesService.cleanupExpiredRoutes` | every 10 min | `ACTIVE` → `FINISHED` at departure, hard-delete after a 24h grace period (`docs/free-routes.md`) |
| `ImagesService.purgeOrphanedImages` | daily 03:00 | Deletes never-attached uploads (>24h) and rejected applications' photos (>7d) from **Supabase Storage and** the DB |
| `AnalyticsTrackingService.purgeExpiredVisitorDays` | daily 04:00 | Trims the visitor-dedup ledger past its retention window (`docs/analytics.md`) |
| `DriverAuthService.purgeSpentLoginCodes` | daily 04:00 | Deletes driver + admin OTP rows older than 24h |

These run in-process, so they only fire while the backend is up, and `instances:
1` in `ecosystem.config.js` is load-bearing: running two PM2 instances would run
every job twice.

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
| `HOST` | no, default `127.0.0.1` | Interface to bind. Loopback by default so nginx is the only way in — see "Why the API binds loopback" below. Set `0.0.0.0` only if something must reach the API without nginx |
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
| `ANALYTICS_VISITOR_PEPPER` | no, falls back to `DRIVER_JWT_SECRET` | Pepper for hashing analytics visitor ids (see `docs/analytics.md`). Optional so analytics needs no new setup on an existing deploy. **Changing it makes every returning visitor count as new** from that point on; historical aggregates are unaffected |

## Environment variables reference (frontend)

Set via PM2's `env` block in production, or a local `.env` for dev:

| Variable | Notes |
| --- | --- |
| `NUXT_PUBLIC_API_BASE_URL` | Full backend URL including `/api/v1`, as the **browser** calls it. Empty = mock mode (see `docs/architecture.md`) |
| `NUXT_INTERNAL_API_BASE_URL` | Same API as the **server** calls it during SSR — `http://127.0.0.1:4002/api/v1` in production. Empty = fall back to the public URL (fine locally, where both are localhost). Not optional in production: without it every server-rendered page shares one rate-limit bucket, see `docs/auth-and-security.md` § "SSR is exempt" |
| `PORT` | Reserved `3002` |
