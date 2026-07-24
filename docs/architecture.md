# Architecture

## High-level shape

```
Browser
  │
  ▼
Nuxt 3 frontend (SSR, port 3002)
  pages/ → composables/ → services/ → repositories/ → apiClient.ts ──┐
                              │                                      │
                              └── mocks/ (when API disabled)         │
                                                                      ▼
                                                     NestJS backend (port 4002, /api/v1)
                                                     controller → service → repository → Prisma
                                                                      │
                                                                      ▼
                                                                PostgreSQL
                                                     (+ Supabase Storage for images only)
```

Two independent Node processes in production, run under PM2
(`evakuators-frontend`, `evakuators-backend`), fronted by nginx doing TLS +
routing by hostname (`evakuators.am` → frontend, `api.evakuators.am` →
backend). See `docs/deployment.md`.

## Frontend layering (strict, don't skip a layer)

```
pages/*.vue          route components — call composables, render, and that's it
composables/*.ts      useAsyncData wrappers around services (useRegions, useTowTrucksInYerevan, ...)
services/*.ts          business logic + the mock/API switch (isApiEnabled())
repositories/*.ts      the ONLY files that call apiFetch()/$fetch — thin HTTP wrappers
mocks/*.ts              in-memory fixture data, used when no backend is configured
```

A component should never import a repository directly, and a service should
never import `$fetch` directly — everything HTTP-shaped funnels through
`repositories/apiClient.ts`'s `apiFetch()`. This is what makes the mock/API
switch (below) work transparently: swap `NUXT_PUBLIC_API_BASE_URL` and every
service starts hitting real endpoints with zero component changes.

Global components are registered with `pathPrefix: false` in
`nuxt.config.ts`, so e.g. `frontend/components/location/RegionCard.vue` is
used in templates as bare `<RegionCard>`, not `<LocationRegionCard>`. Keep
this in mind when grepping for a component's usage — the folder name isn't
part of the tag name.

## The mock/API switch — read this before debugging "why is data wrong"

`frontend/repositories/apiClient.ts`:

```ts
export function isApiEnabled(): boolean {
  return getApiBase().length > 0   // NUXT_PUBLIC_API_BASE_URL
}
```

Every service (`frontend/services/*.service.ts`) branches on this at the top
of nearly every method:

```ts
getAll(): Promise<TowTruck[]> {
  if (isApiEnabled()) return towTruckRepository.getAll()
  return mockRequest(() => mockTowTrucks)
}
```

- `NUXT_PUBLIC_API_BASE_URL` **empty** → the entire site runs on
  `frontend/mocks/towTrucks.ts` (~a few dozen fixture tow trucks) and the
  static `frontend/data/*` geography. No backend needed at all — this is how
  the frontend can be developed and deployed as a pure static-feeling site.
- `NUXT_PUBLIC_API_BASE_URL` **set** (e.g. `http://localhost:4002/api/v1` or
  `https://api.evakuators.am/api/v1`) → every service call goes through
  `repositories/*.ts` → real HTTP → NestJS.

Symptom if you forget this exists: "I approved a registration in `/admin` but
the tow truck doesn't show up on the site" — check whether the frontend's
`.env` actually has `NUXT_PUBLIC_API_BASE_URL` set. Without it, `/admin`
itself doesn't even function correctly (it needs a real backend to manage
real registration requests), but the public pages will look completely normal
because they're happily serving mock data.

`frontend/data/*` (regions/cities/districts) is **never** behind this switch
— it's imported directly, always. Only `towTruckCount`-style statistics
computed *from* tow truck data go through the switch.

## Backend layering

```
*.controller.ts    route + guards + throttle overrides — thin, no business logic
*.service.ts         business logic, orchestrates repositories, throws Nest HTTP exceptions
*.repository.ts       the ONLY files that call this.prisma.* — one per Prisma model area
dto/*.dto.ts           class-validator input shapes, referenced by @Body()/@Query()
*.mapper.ts             Prisma row → public API shape (hides internal fields, computes derived ones)
```

Modules are feature-scoped (`tow-trucks`, `admin`, `admin-auth`, `driver-auth`,
`my-tow-truck`, `registration`, `reviews`, `images`, `free-routes`, `telegram`,
`health`, `storage`, `prisma`), each wired in `backend/src/app.module.ts`.

Global pipes/guards set up in `main.ts` / `app.module.ts`:
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } })`
  in `main.ts` — any request body/query field not declared in a DTO causes a
  **400 error** (both flags on: `forbidNonWhitelisted` rejects rather than
  silently stripping). `transform: true` + implicit conversion means query
  strings get coerced to the DTO's declared types (e.g. `@IsNumber()` on a
  querystring value works without manual `Number()` calls).
- `helmet()` for baseline security headers.
- `ThrottlerModule` global default 60 req/60s per IP; abuse-prone endpoints
  (image upload, registration/review submission, driver-auth) override with a
  stricter `@Throttle()` on the controller method — check the controller
  before assuming the global limit applies.
- `ScheduleModule.forRoot()` powers `@Cron()` in `FreeRoutesService` (see
  `docs/free-routes.md`).

## Image pipeline

```
Frontend upload form → POST /api/v1/images (multipart, field "file")
  → ImageProcessorService (Sharp: auto-rotate, resize, re-encode WebP)
  → SupabaseStorageService.uploadWebp() (Supabase Storage bucket, NOT Supabase DB/Auth)
  → TowTruckImage row created (path, url, width, height, sizeBytes), unattached
  → id returned to frontend
  → frontend includes that id in registration submission (imageIds[])
  → backend attaches images to the RegistrationRequest at submit time
  → on approval, images are re-pointed from registrationRequestId to towTruckId
```

Supabase is used **exclusively** for Storage. Its own database and auth
products are explicitly not used — `backend/src/prisma/*` talks to a plain
PostgreSQL instance (can be self-hosted, RDS, anything), completely separate
from Supabase's own Postgres offering if you happened to provision one.

## SEO / rendering

Nuxt 3 SSR (not static generation) — `frontend/server/routes/sitemap.xml.ts`
builds a dynamic sitemap. `useSeoMetaData` composable centralizes
title/description/canonical/og-image per page. `frontend/utils/schemaOrg.ts`
builds JSON-LD structured data for tow truck profiles.
