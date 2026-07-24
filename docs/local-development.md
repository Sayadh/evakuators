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

### 4. Admin account

```bash
cd backend
npm run admin:create -- admin@example.com 'a-strong-password'
```

Then log in at `localhost:3002/admin`.

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

## Local vs production data — always separate, by design

Local Postgres and production Postgres are two entirely independent
databases. Approving a registration through the local admin panel will never
make that tow truck appear on evakuators.am, and data already live on
evakuators.am will never appear locally — there is no sync, and this is
intentional (keeps local experimentation, including destructive testing,
from ever risking real data). If you need realistic data locally, either
register fresh test entries through the local `/register` + `/admin` flow,
or take a deliberate read-only snapshot/dump of production and restore it
locally — never point a local dev `DATABASE_URL` directly at the production
database for routine work.

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
