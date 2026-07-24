# Evakuators.am — orientation for AI agents

Full-stack monorepo for a tow-truck (evacuator) discovery platform in Armenia.
Nuxt 3 frontend, NestJS backend, PostgreSQL via Prisma, Supabase Storage for
images. Content and UI are Armenian (`hy`); code, comments and identifiers are
English.

Read this file first. It orients you and points to `docs/*.md` for depth —
don't try to hold the whole system in your head from this file alone, go read
the relevant doc before touching code in that area.

## The one rule that breaks everything if violated

**Ports are fixed and reserved. Frontend is always `3002`. Backend is always
`4002`. Never swap them, never "free up" one by reassigning the other.**
This is asserted in comments at every place a port is configured
(`nuxt.config.ts`, `backend/.env`, `ecosystem.config.js`) — if you see a port
number in this codebase, it is not arbitrary.

## Monorepo layout

```
frontend/     Nuxt 3, Vue 3 Composition API, TypeScript, Pinia, SCSS — port 3002
backend/      NestJS, Prisma, PostgreSQL, Supabase Storage — port 4002, routes under /api/v1
nginx/        Example reverse-proxy config for production
ecosystem.config.js   PM2 process definitions for both apps
docs/         Deep-dive docs — read these before making non-trivial changes
```

Two completely separate npm projects, two completely separate deploys. There
is no shared code, no shared types, no monorepo tool (no Turborepo/Nx). When
something needs to stay in sync between them (see "Manual sync points"
below), it is only enforced by comments and human/AI discipline — nothing
catches a drift at compile time or in CI.

## Core architectural decision: where does data live?

This is the single most important thing to understand before changing
anything.

- **Static, never-changing data — regions, cities, Yerevan districts, service
  types, vehicle types, capacity ranges — lives ONLY in the frontend**, as
  TypeScript constants (`frontend/data/*.ts`, `frontend/constants/*.ts`).
  The backend has **no geography or taxonomy tables at all**. It stores and
  returns raw slugs (e.g. `"ashtarak"`, `"flatbed"`) and trusts the frontend
  to resolve them to human-readable Armenian labels.
- **Dynamic, business data** — tow trucks, images, reviews, registration
  requests, free routes, admin users — lives in PostgreSQL, accessed only
  through Prisma inside the backend.

Consequence you will hit constantly: any time the backend needs to store a
*name* alongside a slug (e.g. `TowTruck.serviceAreas`, `TowTruck.locationName`),
the **frontend must resolve and send the name explicitly** — the backend
cannot look it up itself. See `docs/data-model.md` and the `serviceAreas`
handling in `backend/src/admin/admin.service.ts` for a concrete example (and
a bug that happened when this rule was violated).

See `docs/architecture.md` for the full layering and the mock/API switch.

## Manual sync points (no compile-time enforcement)

These pairs must be kept identical by hand. Search both sides before you
assume one is unused:

- `frontend/types/enums.ts` `ServiceType.Available247` value (`'available-24-7'`)
  ↔ `backend/src/tow-trucks/service-slugs.ts` `AVAILABLE_24_7_SLUG`.
- `frontend/constants/vehicles.ts` `CAPACITY_RANGE_OPTIONS` slugs ↔ nothing
  stored on the backend directly, but `representativeCapacityTons()` in the
  same file is the only place a range slug becomes a real `capacityTons`
  float — see `docs/taxonomies.md`.
- Region/city/district slugs used anywhere in `backend/prisma/schema.prisma`
  comments/fields must exist in `frontend/data/{regions,cities,districts}.ts`.

## Quick map: "I need to..."

| Task | Start here |
| --- | --- |
| Understand request/response flow, mock vs real API | `docs/architecture.md` |
| Understand a Prisma model or add a migration | `docs/data-model.md` |
| Touch admin login, driver login, Telegram OTP/link | `docs/auth-and-security.md` |
| Touch services/vehicle-types/capacity pickers or filters | `docs/taxonomies.md` |
| Touch "Ազատ երթուղիներ" (Free Routes) | `docs/free-routes.md` |
| Find what a specific page/route does | `docs/pages-and-routes.md` |
| Run the app on a local machine | `docs/local-development.md` |
| Deploy to the VPS | `docs/deployment.md` |
| Look up an endpoint | `docs/api-reference.md` |

## Commands

```bash
# frontend/
npm run dev      # http://localhost:3002
npm run build    # → .output
npm run lint      # ESLint (also fix: lint:fix)

# backend/
npm run start:dev   # http://localhost:4002/api/v1, watch mode
npm run build        # → dist
npm run lint          # ESLint on src/**/*.ts
npm run prisma:migrate   # dev: create + apply a new migration
npm run prisma:deploy    # prod: apply existing migrations only
npm run admin:create -- <email> <password>   # create/reset an admin login
```

Both apps have independent lint/build — always verify both after a
cross-cutting change (e.g. anything touching `serviceAreas`, `capacityRange`,
or a Prisma model) even if you only edited one side.

## Non-obvious things worth knowing up front

- **The Telegram bot has exactly one webhook URL, globally, for the whole
  bot.** It is normally pointed at production. Testing the Telegram
  login/link flow against a local backend does **not work** unless you stand
  up a second bot + tunnel — see `docs/local-development.md`. This has been a
  repeated source of confusing "link is invalid" reports; the actual code is
  usually correct, the webhook is just delivering to the other environment.
- **`isApiEnabled()` is the master switch** for the entire frontend data
  layer — see `docs/architecture.md`. When empty, absolutely everything
  (including the admin panel, which only makes sense with a real backend)
  silently falls back to `frontend/mocks/`.
- Local Postgres and production Postgres are two entirely separate
  databases. Approving a registration locally will never make it appear on
  evakuators.am, and vice versa. This is intentional, not a bug.
- After every `git pull` on the VPS that touched `backend/prisma/schema.prisma`,
  `npx prisma generate` must be re-run before `npm run build`, or the build
  will reference a stale Prisma Client and fail with confusing "property does
  not exist" TypeScript errors.
