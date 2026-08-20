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

## PostGIS is a prerequisite, not a migration step

The nearest-evacuator search needs the `postgis` extension. Its migration says
`CREATE EXTENSION IF NOT EXISTS postgis;`, but that statement requires a
**superuser**, and `prisma migrate deploy` connects as the `DATABASE_URL` role —
which on this deployment is not one. So the package and the extension are a
one-time server step, done before the first deploy that carries the migration:

```bash
# once per server — match your Postgres major version
apt install postgresql-16-postgis-3

# once per database, as the postgres OS user
sudo -u postgres psql -d evakuators         -c 'CREATE EXTENSION IF NOT EXISTS postgis;'
sudo -u postgres psql -d evakuators_staging -c 'CREATE EXTENSION IF NOT EXISTS postgis;'
```

`IF NOT EXISTS` is why doing it by hand and letting the migration try are both
safe, in either order. If it is skipped, `migrate deploy` fails on
`20260805150000_add_postgis_tow_truck_location` with a permission error and
applies nothing — a clean stop, not a half-migrated database.

**On staging this needs the ownership fix too.** `refresh-staging-db.sh` restores
as the `postgres` role and grants privileges to `evakuators`, but `GRANT` is not
ownership and `ALTER TABLE` requires ownership — so the first migration after a
refresh fails with `42501: must be owner of table TowTruck`. See § "Refreshing
staging's data".

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
`evakuators.am` → frontend on `127.0.0.1:3002`, `api.evakuators.am` → backend
on `127.0.0.1:4002`. TLS via certbot
(`certbot --nginx -d evakuators.am -d www.evakuators.am -d api.evakuators.am`).
Both `AdminJwtGuard` and `DriverJwtGuard` enforce auth in the NestJS app
itself, not via nginx — auth still works correctly even if nginx config
changes or is bypassed in some edge case.

**Exactly one address is canonical: `https://evakuators.am`.** The other three
forms that resolve — `http://evakuators.am`, `http://www.evakuators.am`,
`https://www.evakuators.am` — all 301 to it, so the canonical tags the app
emits (`SITE_URL` in `frontend/constants/site.ts`) describe the address a
visitor is actually on. The http→https redirect excludes
`/.well-known/acme-challenge/` or certbot renewal breaks the moment it starts
redirecting everything. This is a real edit to the server's live config, not a
one-time setup step — **never overwrite the server's nginx file with the repo's
example wholesale**, it would delete certbot's actual `ssl_certificate`
directives; add the missing redirect block by hand, then `nginx -t` before
reloading.

## Staging environment

A second, full copy of the stack on the same VPS — `staging.evakuators.am` /
`staging-api.evakuators.am`, ports `3003`/`4003` (one above production's
`3002`/`4002`) — loaded with a real, current copy of production's data, so a
change can be built, deployed and clicked through against real drivers,
cities, service zones and photos before it ever reaches `evakuators.am`. Not
a second server: no new cost, and everything in `docs/local-development.md`
about Postgres/PM2/nginx already applies here, just against a second
checkout.

**Isolated from production:** its own database (a copy, not a connection —
see "Database: copy, not connection" below), its own ports, its own PM2
process names, its own domain, its own JWT/webhook secrets. **Shared with
production, by deliberate and specifically-guarded choice:** the Telegram
driver bot's token and the Supabase Storage bucket. Both of the sections
below explain exactly what makes each of those two safe to share rather than
just "usually fine."

### Database: copy, not connection

Staging's `DATABASE_URL` points at `evakuators_staging` — a real, separate
PostgreSQL database on the same instance, never production's `evakuators`
database. It starts as a `pg_dump`/`pg_restore` copy of production and stays
that way: nothing after the copy links the two databases, so anything staging
does to its rows — including a full reset — cannot reach production's.
`scripts/refresh-staging-db.sh` is the only supported way to (re)populate it;
see "Refreshing staging's data" below.

### Telegram: same bot token, outbound messages allow-listed

Telegram gives one bot exactly one **webhook** — the URL Telegram calls for
*incoming* updates (`/start`, account-linking) — globally, and that stays
pointed at production
(`https://api.evakuators.am/api/v1/telegram/webhook`, registered by the
one-time `curl ... /setWebhook` command below). **Nothing in this codebase
ever calls `setWebhook` or `deleteWebhook`** — grep for it, it isn't there;
the only place either string appears is a comment explaining what Telegram
echoes back on a call the *human operator* makes by hand. So staging's
backend holding the same `TELEGRAM_BOT_TOKEN` does not move, share, or
otherwise affect where Telegram delivers incoming messages: those keep going
to production, and only production, exactly as before.

What sharing the token DOES enable: staging's backend can make *outbound*
`sendMessage` calls through the real bot — real link confirmations, real
password handovers, real contact notices — because sending a message needs only
the token, not the webhook. That is genuinely useful (a real end-to-end test),
and genuinely risky on its own: staging's database is a full copy of
production's, so it contains **other real drivers' real, already-linked
`telegramChatId` values**. Triggering a contact notice against a truck that
isn't your own test account during staging testing would deliver a real message
to that real person.

`TELEGRAM_OUTBOUND_ALLOWED_CHAT_IDS` closes that gap structurally, not just
by operator care: set on staging to your own Telegram chat id (message
`@userinfobot` to get it), `TelegramService.sendMessage()` sends only to
chat ids on that list and silently skips every other one — no HTTP call to
Telegram happens at all for a skipped send, and the caller (e.g. the webhook
handing out a password) sees it resolve exactly as if it had sent, so nothing
about the staging flow itself needs to change or behaves differently. Leave this
variable **blank on production** — blank means unrestricted, today's real
behaviour. See `backend/test/telegram.service.outbound-allowlist.spec.ts`
for this pinned in a test, and the doc comment on `sendMessage()` itself for
the full reasoning.

The admin 2FA bot is unaffected by any of this — it's a separate token
(`ADMIN_TELEGRAM_BOT_TOKEN`), left **blank** on staging by default (see
`backend/.env.staging.example`), which keeps admin login single-factor there
and means there is nothing to guard on that side at all.

### Supabase Storage: same bucket, staging is read-only

Staging shares production's real Supabase project and bucket rather than
getting its own. This is why images "just work" on staging with zero setup:
every copied `TowTruck`/`RegistrationRequest` row's image URL is an absolute,
public Supabase Storage URL — Supabase serves it to any browser regardless of
which app rendered the page linking to it, so nothing about the frontend or
backend needs to know or care that the photo predates staging's existence.

What must never happen is staging **writing** into that bucket — a driver
registering, editing a profile, or an admin approving a request on staging
must not be able to create, replace or delete a real file in production's
real Storage. `SUPABASE_STORAGE_READ_ONLY=true` enforces exactly that:
`SupabaseStorageService` — the *only* place in the whole project that talks
to Supabase — refuses every `uploadWebp()`/`remove()` call before it reaches
the network, throwing a clear "read-only in this environment" error instead.
Existing callers already wrap storage calls in `try/catch` for unrelated
reasons (a Storage hiccup shouldn't block an admin's delete, an orphan-purge
failure should just retry tomorrow), so this fails exactly as gracefully as
any other storage error — nothing crashes, nothing silently half-succeeds.
One consequence worth expecting, not a bug: the daily `purgeOrphanedImages`
cron (`docs/deployment.md` § "Scheduled jobs") will log a skipped-write
warning on staging every day it has something to purge; that's the same
graceful "retry next run" path a real Supabase outage would take.

Concretely, on staging: registration, dashboard photo edits, and admin image
approval all still render and validate normally — they just fail at the
final "save the file" step with a clear error, instead of silently
appearing to work. This is what "read-only" is expected to look like; it is
not something to work around.

See `backend/test/supabase-storage.service.read-only.spec.ts` for this
pinned in a test.

### One-time setup

```bash
# Separate checkout, not a subdirectory of production's — building staging
# must never touch production's .output/dist mid-deploy.
git clone <repo-url> /var/www/evakuators-staging
cd /var/www/evakuators-staging

# The database itself — empty at this point. The `evakuators` role already
# exists (production created it), this only needs a new database owned by it.
#
# Run as the `postgres` OS user, not root/your login: `psql postgres` with no
# -U tries to peer-auth as whatever OS user is running it, and Postgres has
# no role by that name unless it happens to be `postgres` or `evakuators`
# themselves. On a VPS shell you are usually root, and there is no Postgres
# role called `root` — that's the `FATAL: role "root" does not exist` you'll
# see if you skip `sudo -u postgres`.
sudo -u postgres psql -c "CREATE DATABASE evakuators_staging OWNER evakuators;"

cp backend/.env.staging.example backend/.env
# Fill in: DATABASE_URL's password; SUPABASE_*/TELEGRAM_BOT_TOKEN/
# TELEGRAM_BOT_USERNAME/TELEGRAM_WEBHOOK_SECRET copied from production's
# backend/.env verbatim; SUPABASE_STORAGE_READ_ONLY="true" (already the
# template default — leave it); TELEGRAM_OUTBOUND_ALLOWED_CHAT_IDS set to
# YOUR OWN Telegram chat id; and fresh values (openssl rand -hex 32) for
# DRIVER_JWT_SECRET / ADMIN_JWT_SECRET / ANALYTICS_VISITOR_PEPPER /
# PRIVACY_CONSENT_IP_SECRET. See the
# file's own comments for exactly which is which.

cd frontend && npm install && npm run build
cd ../backend && npm install && npx prisma generate && npx prisma migrate deploy && npm run build

pm2 start ecosystem.staging.config.js
pm2 save

# Populate it with production's real data — see "Refreshing staging's data"
# below. Do this AFTER the migration above, not instead of it: migrate
# deploy makes sure the schema matches this checkout's Prisma schema first,
# then the refresh script restores production's rows into that schema.
../scripts/refresh-staging-db.sh
```

Then, on the nginx/DNS side: point `staging.evakuators.am` and
`staging-api.evakuators.am` at the VPS, install `nginx/staging.evakuators.am.conf`,
and run
`certbot --nginx -d staging.evakuators.am -d staging-api.evakuators.am`. See
that file's own comments for why it deliberately mirrors
`nginx/evakuators.am.conf`'s structure, and for the `X-Robots-Tag` header
that keeps the whole staging site out of search results (unlike production,
where individual pages opt into `noindex` one at a time).

### Refreshing staging's data

```bash
scripts/refresh-staging-db.sh
```

Dumps production (`pg_dump`, read-only — nothing this script does can write
to production), stops staging's backend, drops and recreates
`evakuators_staging`, restores the dump into it, restarts staging's backend.
Because the restore runs `pg_restore --no-owner --no-privileges` as the
`postgres` OS user, it also re-grants privileges on the restored schema to
the `evakuators` role right after — otherwise every table comes back owned
by `postgres` with nothing granted to `evakuators`, and staging's backend
fails every query with Postgres error 42501 "permission denied for table X".
Prompts for a typed `REFRESH STAGING` confirmation before touching anything,
because "on demand" + "drops a database" is exactly the kind of command that
is dangerous to run twice with the wrong arguments.

Every check the script makes before it does anything destructive is in its
own comments, but the one that matters most: it parses the database name out
of both the production and staging `DATABASE_URL`s and **refuses to run at
all if they're the same** — the single line standing between "refresh
staging" and "wipe production" if a `.env` file is ever misconfigured.

It does not touch Supabase Storage (nothing needs to — see above) or the
Telegram webhook (nothing in this codebase ever touches that programmatically
— see above).

**It also transfers table ownership, which is not the same as granting
privileges.** `GRANT ALL PRIVILEGES` covers DML and is what lets staging's
backend serve pages after a refresh; PostgreSQL requires you to *own* a table to
`ALTER` it, and no GRANT confers that. Without the ownership step every refresh
left a database that read and wrote perfectly and then failed the next
`prisma migrate deploy` with `must be owner of table TowTruck` (SQLSTATE 42501)
— which looked like a broken migration rather than a broken restore. Enums are
included, since a migration that adds an enum value hits the same wall.
Extension members (PostGIS's `spatial_ref_sys` lives in `public`) are filtered
out via `pg_depend` and stay owned by `postgres`.

The mirror of this script for a developer's own machine is
`scripts/refresh-local-db.sh` — it copies **staging**, not production, so it
never opens a connection to the production database at all. See
`docs/local-development.md` § "Mirroring staging locally".

### Routine workflow — staging before production

```bash
# 1. Deploy to staging first
cd /var/www/evakuators-staging
git pull
cd frontend && npm install && npm run build
cd ../backend && npm install && npx prisma generate && npx prisma migrate deploy && npm run build
pm2 restart ecosystem.staging.config.js

# 2. Click through staging.evakuators.am — the exact change, against real
#    data, before production sees it. Refresh staging's data first
#    (scripts/refresh-staging-db.sh) if it's gone stale enough to matter for
#    what you're testing.

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
| `SUPABASE_STORAGE_READ_ONLY` | no, default `false` | `true` blocks every upload/delete at `SupabaseStorageService` before it reaches Supabase. Only ever `true` on a deploy sharing production's bucket read-only — staging, see § "Staging environment" |
| `PORT` | no, default `4002` | Never `3002` |
| `HOST` | no, default `127.0.0.1` | Interface to bind. Loopback by default so nginx is the only way in — see "Why the API binds loopback" below. Set `0.0.0.0` only if something must reach the API without nginx |
| `CORS_ORIGIN` | no, default `http://localhost:3002` | Comma-separated; a prod-only value silently blocks local dev — see `docs/local-development.md` |
| `FRONTEND_URL` | no, default `https://evakuators.am` | Used to build the "Login" button link in Telegram messages; not zod-validated |
| `TELEGRAM_BOT_TOKEN` | yes | |
| `TELEGRAM_BOT_USERNAME` | yes | Without the `@` |
| `TELEGRAM_WEBHOOK_SECRET` | yes | Random string, checked with `timingSafeEqual` against Telegram's header |
| `TELEGRAM_OUTBOUND_ALLOWED_CHAT_IDS` | no, default `''` | Comma-separated chat ids; `sendMessage()` skips (no Telegram API call) anyone else, silently. Blank = unrestricted. Only ever set on a deploy sharing `TELEGRAM_BOT_TOKEN` with another environment — staging, see § "Staging environment" |
| `DRIVER_JWT_SECRET` | yes, min 16 chars | Signs driver session tokens; also the default pepper for analytics visitor hashes. Driver passwords are bcrypt-hashed and do **not** depend on it — rotating this logs everyone out, it does not invalidate passwords |
| `ADMIN_JWT_SECRET` | yes, min 16 chars | Deliberately separate from `DRIVER_JWT_SECRET`; also the admin OTP hashing pepper |
| `ADMIN_TELEGRAM_BOT_TOKEN` | no, default `''` | Separate bot from `TELEGRAM_BOT_TOKEN` — admin 2FA + registration alerts. Blank = feature off, login stays single-factor |
| `ADMIN_TELEGRAM_BOT_USERNAME` | no, default `''` | Without the `@` |
| `ADMIN_TELEGRAM_WEBHOOK_SECRET` | no, default `''` | Same `timingSafeEqual` pattern as `TELEGRAM_WEBHOOK_SECRET` |
| `ADMIN_TELEGRAM_ALLOWED_CHAT_IDS` | no, default `''` | Comma-separated chat ids; anyone else is silently ignored by the bot. Blank = unrestricted |
| `ROUTE_MATRIX_API_KEY` | no, default `''` | OpenRouteService key for the road distances/times on `/evakuator`. Blank = no external call is ever made and the search shows PostGIS straight-line distances with **no** estimated times — the same fallback a routing outage produces, so a deploy without a key is a working deploy with a smaller answer. This deployment's key is capped at 500 req/day (`NEAREST_ORS_DAILY_QUOTA`); one visitor search is one request, cached 5 minutes, and the app stops calling ORS with margin to spare rather than risk exceeding the real limit. See `docs/nearest-search.md` |
| `ROUTE_MATRIX_BASE_URL` | no, default `https://api.openrouteservice.org` | Only for pointing at a self-hosted instance |
| `ANALYTICS_VISITOR_PEPPER` | no, falls back to `DRIVER_JWT_SECRET` | Pepper for hashing analytics visitor ids (see `docs/analytics.md`). Optional so analytics needs no new setup on an existing deploy. **Changing it makes every returning visitor count as new** from that point on; historical aggregates are unaffected |
| `PRIVACY_CONSENT_IP_SECRET` | no, falls back to `DRIVER_JWT_SECRET` | HMAC key for the `ipHash` on a privacy-consent record (see `docs/auth-and-security.md` § "Privacy consent"). Optional for the same reason as the pepper above — an existing deploy must not silently stop recording consent because a new variable was missed. Rotating it only breaks "same IP as last time" comparisons across the rotation; it cannot affect who consented, to what, or when |

## Environment variables reference (frontend)

Set via PM2's `env` block in production, or a local `.env` for dev:

| Variable | Notes |
| --- | --- |
| `NUXT_PUBLIC_API_BASE_URL` | Full backend URL including `/api/v1`, as the **browser** calls it. Empty = mock mode (see `docs/architecture.md`) |
| `NUXT_INTERNAL_API_BASE_URL` | Same API as the **server** calls it during SSR — `http://127.0.0.1:4002/api/v1` in production. Empty = fall back to the public URL (fine locally, where both are localhost). Not optional in production: without it every server-rendered page shares one rate-limit bucket, see `docs/auth-and-security.md` § "SSR is exempt" |
| `PORT` | Reserved `3002` |
