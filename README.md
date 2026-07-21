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
  When `NUXT_PUBLIC_API_BASE` is empty the app runs on local mock data
  (`frontend/mocks`) — same UI, no backend required.

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
| `PORT` | Backend port (default `3001`) |
| `CORS_ORIGIN` | Comma-separated allowed origins |

Frontend (set in `ecosystem.config.js` or the shell):

| Variable | Description |
| --- | --- |
| `NUXT_PUBLIC_API_BASE` | e.g. `https://api.evakuators.am`. Empty = mock mode |

## 3. Database

```bash
cd backend
npx prisma migrate deploy   # applies prisma/migrations
npx prisma generate
```

For local development use `npm run prisma:migrate` (creates new migrations).

## 4. Supabase Storage

1. Create a project at supabase.com (the database and auth of that project are NOT used).
2. Storage → New bucket → name it (e.g. `tow-truck-images`), mark it **Public**.
3. Copy the project URL and the `service_role` key into `backend/.env`.

## 5. Build

```bash
cd frontend && npm run build     # → frontend/.output
cd ../backend && npm run build   # → backend/dist
```

## 6. Run with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup       # start on server reboot
```

- `evakuators-frontend` → port 3000
- `evakuators-backend` → port 3001 (reads `backend/.env`)

## 7. Nginx

```bash
cp nginx/evakuators.am.conf /etc/nginx/sites-available/evakuators.am
ln -s /etc/nginx/sites-available/evakuators.am /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d evakuators.am -d www.evakuators.am -d api.evakuators.am
```

- `evakuators.am` → Nuxt frontend
- `api.evakuators.am` → NestJS API

## 8. Deploying updates

```bash
git pull
cd frontend && npm install && npm run build
cd ../backend && npm install && npx prisma migrate deploy && npm run build
pm2 restart ecosystem.config.js
```

## API overview

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness + DB status |
| `GET` | `/tow-trucks` | List (filters: `city`, `district`, `region`+`regionCities`, `yerevan`, `limit`) |
| `GET` | `/tow-trucks/:slug` | Single profile |
| `GET` | `/tow-trucks/:id/reviews` | Approved reviews |
| `POST` | `/tow-trucks/:id/reviews` | Submit review (moderated) |
| `POST` | `/images` | Upload image (multipart `file`) → WebP → Supabase |
| `POST` | `/registrations` | Submit driver registration |
| `GET` | `/admin/registration-requests` | List requests (`?status=PENDING`) |
| `POST` | `/admin/registration-requests/:id/approve` | Create TowTruck from request |
| `POST` | `/admin/registration-requests/:id/reject` | Reject request |

> The `User` model and the `/admin` endpoints are prepared for future authentication;
> before going live put `/admin` behind auth (guard + JWT) or network-level protection.

## Frontend details

See `frontend/README.md` for the frontend architecture (components, composables,
services, SEO helpers).
