# Local development

## Fast path — frontend only, no backend

```bash
cd frontend
npm install
npm run dev   # http://localhost:3002
```

Leave `NUXT_PUBLIC_API_BASE_URL` unset/empty and the entire site runs on
mock data (see `docs/architecture.md`). This is enough for almost all UI
work. You only need the backend running locally for: registration
submission, admin panel, driver login/dashboard, Free Routes persistence.

## Full path — frontend + backend + local Postgres

### 1. PostgreSQL

You need a **local** Postgres role and database — nothing creates these for
you, and on a fresh machine they simply don't exist yet (this has been
mistaken for a permissions error before — the actual symptom the first time
around was `FATAL: role "evakuators" does not exist` /
`FATAL: database "evakuators" does not exist`, not a `P1010` permissions
issue as it first appeared).

```bash
psql postgres -c "CREATE ROLE evakuators WITH LOGIN PASSWORD 'your-password' SUPERUSER;"
psql postgres -c "CREATE DATABASE evakuators OWNER evakuators;"
```

If your `DATABASE_URL` password is URL-encoded (e.g. `%26` for `&`, `%40`
for `@`), decode it back to the raw form before using it in a raw SQL
`CREATE ROLE ... PASSWORD '...'` statement — SQL doesn't use URI
percent-encoding.

On Postgres 15+, the `public` schema no longer grants `CREATE` to arbitrary
roles by default (only the schema owner) — moot if you made `evakuators` the
DB owner as above, but worth knowing if you see permission errors with a
differently-configured role.

### 2. Backend env + migrate

```bash
cd backend
cp .env.example .env
# fill in DATABASE_URL, SUPABASE_*, generate secrets:
#   openssl rand -hex 32   (for TELEGRAM_WEBHOOK_SECRET, DRIVER_JWT_SECRET, ADMIN_JWT_SECRET)
npx prisma migrate deploy
npx prisma generate
npm run start:dev   # http://localhost:4002/api/v1
```

Double-check `CORS_ORIGIN` in `backend/.env` includes
`http://localhost:3002`. The `.env.example` default does, but a
copy-pasted-from-production value like
`CORS_ORIGIN="https://evakuators.am,https://www.evakuators.am"` silently
excludes localhost — every request from a locally-running frontend then
fails as a **browser-side CORS error** (visible in the Network tab as red
"CORS ..." status on every request), which looks like a backend-down
problem but isn't. Env vars are read once at process boot — after editing
`.env` you must fully restart (`Ctrl+C`, then `npm run start:dev` again),
not just save the file.

### 3. Frontend env

```bash
cd frontend
echo 'NUXT_PUBLIC_API_BASE_URL=http://localhost:4002/api/v1' > .env
npm run dev
```

Verify it actually took effect from the browser console:
`useNuxtApp().$config.public.apiBaseUrl` should print
`'http://localhost:4002/api/v1'`, not an empty string.

`NUXT_INTERNAL_API_BASE_URL` (the URL SSR uses — see `docs/deployment.md`) is
deliberately left unset here: locally the public URL is already localhost, so
it falls back to that. Production must set it.

### 4. Admin account

```bash
cd backend
npm run admin:create -- admin@example.com 'a-strong-password'
```

Then log in at `localhost:3002/admin`.

## Mirroring staging locally

The two paths above give you a working local stack with *your own* data. This
one gives you a local stack that behaves like staging — same rows, same schema,
same extensions, same Supabase bucket, same bot — so a bug that reproduces on
one reproduces on the other, and "it works locally" stops being a different
claim from "it works on staging".

```bash
cp backend/.env.local.example backend/.env    # then fill it in — see below
echo 'NUXT_PUBLIC_API_BASE_URL=http://localhost:4002/api/v1' > frontend/.env

scripts/refresh-local-db.sh                   # dumps staging over ssh, restores locally

cd backend && npx prisma generate && npm run start:dev
cd frontend && npm run dev
```

`refresh-local-db.sh` copies **staging**, not production, and that is the point:
staging is already a copy of production, so the rows are the same either way,
and this script never opens a connection to the production database at all.
There is no flag, no misconfigured `.env` and no typo'd hostname that can turn
"refresh my laptop" into something production notices. It also refuses to run if
your local `DATABASE_URL` points anywhere other than localhost — the safeguard
against a copy-pasted staging connection string sitting in a local `.env`.

It installs PostGIS into the local database before restoring, because the dump
contains a `geography` column and the restore fails on the type itself
otherwise. It also transfers table ownership to `evakuators` afterwards:
`pg_restore` runs as the superuser, `GRANT` is not ownership, and PostgreSQL
requires ownership for `ALTER TABLE` — so without that step the next
`prisma migrate dev` fails with `must be owner of table TowTruck`.

### What differs, and why each one has to

| | Local | Staging | Why |
| --- | --- | --- | --- |
| Ports | `3002` / `4002` | `3003` / `4003` | Both pairs are reserved (CLAUDE.md). Never swap the halves of either. |
| `DATABASE_URL` | your machine | the VPS | Necessarily. |
| JWT secrets / analytics pepper | fresh | staging's | A token minted in a local experiment must not work against staging. |
| Everything else | — | — | Copied verbatim. |

`SUPABASE_STORAGE_READ_ONLY="true"` is **not** optional here. Your local database
now holds copies of production's rows, so an upload or a delete from a local
dashboard would write into production's real bucket. Expect registration,
dashboard photo edits and admin image approval to render and validate normally
and then fail at the final save with a clear read-only error — that is the flag
working, not a bug.

`TELEGRAM_OUTBOUND_ALLOWED_CHAT_IDS` is not optional either, for the same reason
it is not on staging: the copied rows carry real drivers' real linked chat ids,
so requesting a login code for a number that is not your own test account
delivers a real message to a real person. Set it to your own chat id.

### The one thing that cannot be mirrored

The Telegram **webhook** — see the next section. Outbound messages (OTP codes)
work locally once the token is copied; inbound account-linking cannot, because
a bot has exactly one webhook URL globally and it belongs to production.

## Telegram login/link flow — does NOT work locally by default

This is the single most confusing local-dev gotcha in the project, worth
reading in full before spending time debugging a "link is invalid or
expired" report.

**Why:** a Telegram bot has exactly one webhook URL, registered globally via
`setWebhook`. It's normally pointed at
`https://api.evakuators.am/api/v1/telegram/webhook` (production). When you
generate a Telegram link from a **local** admin panel, the token is written
to your **local** database — but the driver's `/start <token>` tap still
gets delivered by Telegram to whatever URL the webhook is currently
registered to (production), which looks the token up in the **production**
database, doesn't find it, and replies "link is invalid or expired." The
token, the code, the clock — none of it is actually broken; the webhook is
just delivering to the other environment. See `docs/auth-and-security.md`.

**If you need to test this locally**, stand up a second, throwaway bot:

1. Telegram → `@BotFather` → `/newbot` → get a token + username for a test bot.
2. `brew install ngrok`, then with the local backend running on 4002:
   `ngrok http 4002` → note the public `https://...ngrok-free.app` URL.
3. Point the **test bot's** webhook at that URL (production bot is
   untouched):
   ```bash
   curl "https://api.telegram.org/bot<TEST_BOT_TOKEN>/setWebhook?url=https://<ngrok-url>/api/v1/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```
4. In local `backend/.env`, swap `TELEGRAM_BOT_TOKEN`/`TELEGRAM_BOT_USERNAME`
   to the test bot's values, restart the backend.
5. ngrok's free-tier URL changes every restart — re-run step 3 with the new
   URL at the start of each local testing session.

If this feels like too much ceremony for occasional testing, the pragmatic
call made on this project so far is: **don't bother** — test the Telegram
flow directly on production instead, and treat local dev as sufficient for
everything else (this was an explicit decision, not an unresolved TODO).

## Local vs production data — never a live connection, by design

Local Postgres and production Postgres are two entirely independent
databases. Approving a registration through the local admin panel will never
make that tow truck appear on evakuators.am, and data already live on
evakuators.am will never appear locally — there is no sync, and this is
intentional (keeps local experimentation, including destructive testing,
from ever risking real data).

Copying the data is fine and supported; **connecting** to production's database
is not. Never point a local `DATABASE_URL` at it, not even read-only. For
realistic data, either register fresh test entries through the local
`/register` + `/admin` flow, or run `scripts/refresh-local-db.sh` (see
"Mirroring staging locally" above), which copies staging — already a copy of
production — and so never touches production at all.

Whichever you choose, a local database holding copies of real rows inherits
staging's two guards along with the data: `SUPABASE_STORAGE_READ_ONLY="true"`
and `TELEGRAM_OUTBOUND_ALLOWED_CHAT_IDS` set to your own chat id. Real rows mean
real phone numbers, real Telegram chat ids and real Storage objects; the data
being on your laptop changes none of that.

## Common mistakes seen in practice

- Running a command in the wrong terminal tab (VPS SSH session vs local
  shell) — both can look similar; check the prompt (`root@<vps-hostname>` vs
  your local username@hostname) before assuming a command ran where you
  think it did.
- Running `backend/.env`-relative commands (e.g. `cat backend/.env`) while
  already `cd`'d into `backend/` — check `pwd` / the shell prompt first.
- Appending to `.env` with `echo '...' >> .env` more than once by accident,
  producing duplicate keys. Prefer a delete-then-append pattern when fixing
  a bad value:
  ```bash
  sed -i '' '/^SOME_KEY=/d' .env && echo 'SOME_KEY="value"' >> .env
  ```
- Forgetting `npx prisma generate` after pulling a schema change — see
  `docs/deployment.md`.
