# Evakuators.am

Հայաստանի էվակուատորների որոնման հարթակ — full-stack monorepo.

```
├── frontend/            Nuxt 3 (Vue 3, TypeScript, Pinia, SCSS)
├── backend/             NestJS + Prisma + PostgreSQL + Supabase Storage
├── nginx/               Example nginx configuration
├── ecosystem.config.js  PM2 process file
└── README.md
```

## Architecture

- **Static data** (regions, cities, Yerevan districts, service/vehicle types) lives in
  `frontend/data` and `frontend/constants` as TypeScript constants. It is never stored
  in the database — the backend references it by slugs.
- **Dynamic data** (tow trucks, images, reviews, registration requests, users) lives in
  PostgreSQL, accessed only through Prisma inside the backend.
- **Images**: frontend → NestJS → validation → Sharp (auto-rotate, resize, WebP) →
  Supabase **Storage** (never Supabase DB/Auth) → record in PostgreSQL.
  Only the backend talks to Supabase.
- **Frontend API layer**: all HTTP goes through `frontend/repositories/`
  (`towTruckRepository`, `registrationRepository`, `imageRepository`).
  When `NUXT_PUBLIC_API_BASE_URL` is empty the app runs on local mock data
  (`frontend/mocks`) — same UI, no backend required.
- **Ports are fixed and reserved** — frontend always `3002`, backend always `4002`.
  Never swap them. The backend serves every route under the `/api/v1` prefix.

## Requirements

- Node.js ≥ 20
- PostgreSQL ≥ 14
- A Supabase project (Storage only) with a **public bucket** (e.g. `tow-truck-images`)
- PM2 + nginx on the production server

## 1. Install

```bash
cd frontend && npm install
cd ../backend && npm install
```

## 2. Environment

```bash
cp backend/.env.example backend/.env
```

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (Storage access, backend only) |
| `SUPABASE_STORAGE_BUCKET` | Public bucket name for tow truck images |
| `PORT` | Backend port — **reserved: `4002`**, never `3002` (that's the frontend) |
| `CORS_ORIGIN` | Comma-separated allowed origins |

Frontend (set in `ecosystem.config.js` or the shell):

| Variable | Description |
| --- | --- |
| `PORT` | Frontend port — **reserved: `3002`**, never `4002` (that's the backend) |
| `NUXT_PUBLIC_API_BASE_URL` | Full backend URL **including** `/api/v1`, e.g. `https://api.evakuators.am/api/v1` (prod) or `http://localhost:4002/api/v1` (dev). Empty = mock mode |

## 3. Driver login (Telegram OTP)

Drivers log into `/dashboard` with their phone number; the login code is delivered
through a Telegram bot (Telegram has no way to message a user who hasn't first
started a chat with the bot, so admin sends each approved driver a one-time
`t.me/<bot>?start=<token>` link — shown automatically in `/admin` right after
approving a registration).

1. In Telegram, message **@BotFather** → `/newbot` → follow the prompts → copy the token.
2. Fill in `backend/.env`:

   | Variable | Description |
   | --- | --- |
   | `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
   | `TELEGRAM_BOT_USERNAME` | Bot username **without** the `@` |
   | `TELEGRAM_WEBHOOK_SECRET` | Random string, e.g. `openssl rand -hex 32` |
   | `DRIVER_JWT_SECRET` | Random string, e.g. `openssl rand -hex 32` |

3. After the backend is deployed and reachable at `https://api.evakuators.am`, register
   the webhook **once**:

   ```bash
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://api.evakuators.am/api/v1/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```

   (Response should be `{"ok":true,"result":true,...}`. Re-run this any time the domain changes.)

## 4. Database

```bash
cd backend
npx prisma migrate deploy   # applies prisma/migrations
npx prisma generate
```

For local development use `npm run prisma:migrate` (creates new migrations).

## 5. Supabase Storage

1. Create a project at supabase.com (the database and auth of that project are NOT used).
2. Storage → New bucket → name it (e.g. `tow-truck-images`), mark it **Public**.
3. Copy the project URL and the `service_role` key into `backend/.env`.

## 6. Build

```bash
cd frontend && npm run build     # → frontend/.output
cd ../backend && npm run build   # → backend/dist
```

## 7. Run with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup       # start on server reboot
```

- `evakuators-frontend` → port 3002
- `evakuators-backend` → port 4002 (reads `backend/.env`), routes under `/api/v1`

## 8. Nginx

```bash
cp nginx/evakuators.am.conf /etc/nginx/sites-available/evakuators.am
ln -s /etc/nginx/sites-available/evakuators.am /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d evakuators.am -d www.evakuators.am -d api.evakuators.am
```

- `evakuators.am` → Nuxt frontend
- `api.evakuators.am` → NestJS API

## 9. Deploying updates

```bash
git pull
cd frontend && npm install && npm run build
cd ../backend && npm install && npx prisma migrate deploy && npm run build
pm2 restart ecosystem.config.js
```

## API overview

All paths are served under the `/api/v1` prefix, e.g. `GET https://api.evakuators.am/api/v1/health`.
`docs/api-reference.md` is the complete, authoritative list (with rate limits) —
the table below is a summary.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Liveness + DB status |
| `GET` | `/api/v1/tow-trucks` | List — **card shape**, not full profiles (filters: `city`, `district`, `region`+`regionCities`, `yerevan`, `limit`, `offset`) |
| `GET` | `/api/v1/tow-trucks/coverage` | Per-truck geography footprint for the region/city/district counters — no contact data |
| `GET` | `/api/v1/tow-trucks/:slug` | Single **full** profile |
| `GET` | `/api/v1/tow-trucks/:id/reviews` | Approved reviews |
| `POST` | `/api/v1/tow-trucks/:id/reviews` | Submit review (moderated) |
| `POST` | `/api/v1/images` | Upload image (multipart `file`) → WebP → Supabase |
| `POST` | `/api/v1/registrations` | Submit driver registration |
| `GET` | `/api/v1/admin/registration-requests` | List requests (`?status=PENDING`) |
| `POST` | `/api/v1/admin/registration-requests/:id/approve` | Create TowTruck from request |
| `POST` | `/api/v1/admin/registration-requests/:id/reject` | Reject request |
| `GET` | `/api/v1/admin/reviews` | List reviews pending moderation |
| `POST` | `/api/v1/admin/reviews/:id/approve` | Publish a review |
| `POST` | `/api/v1/admin/reviews/:id/reject` | Delete a review |
| `POST` | `/api/v1/admin/tow-trucks/:id/telegram-link` | (Re)generate a driver's Telegram-login link |
| `GET` | `/api/v1/admin/tow-trucks` | List every tow truck, active or not |
| `PATCH` | `/api/v1/admin/tow-trucks/:id/active` | Deactivate/reactivate — reversible, hides from public listing |
| `DELETE` | `/api/v1/admin/tow-trucks/:id` | Permanently delete a tow truck + images/reviews/OTPs — irreversible |
| `POST` | `/api/v1/admin-auth/login` | Admin login — returns a JWT |
| `POST` | `/api/v1/driver-auth/request-code` | Driver login step 1 — sends an OTP via Telegram |
| `POST` | `/api/v1/driver-auth/verify-code` | Driver login step 2 — returns a JWT |
| `GET` | `/api/v1/my/tow-truck` | Driver-only — read own profile (Bearer JWT) |
| `PATCH` | `/api/v1/my/tow-truck` | Driver-only — edit own profile (Bearer JWT) |
| `POST` | `/api/v1/telegram/webhook` | Telegram bot webhook (internal, secret-token protected) |
| `POST` | `/api/v1/analytics/events` | Record a visitor interaction (page view / contact click) — public, deduplicated to once per visitor per calendar day |
| `GET` | `/api/v1/my/analytics` | Driver-only — own statistics (`/charts`, `/reviews`, `/ratings` too) |
| `GET` | `/api/v1/admin/tow-trucks/:id/analytics` | Admin — same reports for any tow truck (`/charts`, `/reviews`, `/ratings`) |

## Admin panel

`/admin` (frontend) and every `/api/v1/admin/*` route (backend) are protected by a
real JWT issued at login — the same pattern as driver auth, just email/password
instead of Telegram OTP. `AdminJwtGuard` checks the token on the backend itself
(not nginx), so it works the same whether nginx is in front or not.

1. Add to `backend/.env`: `ADMIN_JWT_SECRET` (generate with `openssl rand -hex 32`).
2. Create the admin account once (uses the `User` model, role `ADMIN`):

   ```bash
   cd backend
   npm run admin:create -- admin@evakuators.am 'a-strong-password'
   ```

   Re-run the same command any time to change the password (it upserts by email).
3. Log in at `https://evakuators.am/admin` with that email/password. The token is
   kept in the browser (localStorage) and expires after 24h.

## Backups

Nothing backs up the database automatically. `scripts/backup-db.sh` is ready to
install as a cron job — see `docs/deployment.md` § "Database backups", including
the two things it can't do for you (getting the dump off the machine, and proving
a restore works).

## Provider analytics

Every driver sees their own statistics in `/dashboard` (page views, unique
visitors, phone/WhatsApp/Telegram/Email clicks, a 7/30/90-day chart, and their
reviews/ratings including ones still awaiting moderation), and an admin sees the
same numbers for any tow truck from `/admin`.

The same visitor cannot inflate a counter more than once per **calendar day in
Armenia time** — enforced by a database unique constraint, not application code.
Visitors are identified by an anonymous UUID stored in a first-party cookie plus
localStorage, hashed before it is stored; there is no login, no IP storage and no
fingerprinting.

No new environment variable is required (`ANALYTICS_VISITOR_PEPPER` is optional).
See `docs/analytics.md` for the schema, index rationale, query plans and security
model.

## Frontend details

See `frontend/README.md` for the frontend architecture (components, composables,
services, SEO helpers).
