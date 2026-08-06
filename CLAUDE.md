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
number in this codebase, it is not arbitrary. Staging (see
`docs/deployment.md` § "Staging environment") has its own reserved pair,
`3003`/`4003` — same rule, one port number over.

## Monorepo layout

```
frontend/     Nuxt 3, Vue 3 Composition API, TypeScript, Pinia, SCSS — port 3002
backend/      NestJS, Prisma, PostgreSQL, Supabase Storage — port 4002, routes under /api/v1
nginx/        Example reverse-proxy config for production
scripts/      Ops scripts run on the VPS (backup-db.sh)
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
  requests, free routes, admin users, analytics counters — lives in PostgreSQL,
  accessed only through Prisma inside the backend.

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
- `frontend/types/enums.ts` `LocationType` values (`'city' | 'district' |
  'route'`) ↔ `@IsIn([...])` on `ServiceAreaDto.type` in
  `backend/src/tow-trucks/dto/service-area.dto.ts`. Both directions of
  `TowTruck.serviceAreas` compare `type` literally, so a mismatch means a
  driver's zone/city/district coverage silently matches nothing in filtering.
  See `docs/locations.md` § "Service zones".
- `frontend/types/enums.ts` `AnalyticsEventType` values ↔ `enum
  AnalyticsEventType` in `backend/prisma/schema.prisma`. These travel over the
  wire in both directions (sent when tracking an event, used as response object
  keys), so a mismatch means a silently uncounted metric on one side and an
  `undefined` card value on the other — see `docs/analytics.md`. The frontend's
  `AnalyticsPeriod` / `AnalyticsReviewStatus` enums mirror the backend TS enums
  in `backend/src/analytics/analytics.enums.ts` the same way. `SiteEventType`
  (site-wide admin traffic) is a third such pair with the same rule.
- `PASSWORD_MIN_LENGTH` in `backend/src/driver-auth/driver-password.ts` ↔ the
  `8` inside `isPassword()` in `frontend/utils/validators.ts`. Raising it on the
  backend only means the change-password form accepts a value the API then
  rejects; raising it on the frontend only means the rule is advisory. Note
  neither rule applies to the LOGIN form on either side, deliberately — see
  `DriverLoginDto`.
- `ARMENIA_BOUNDS` in `frontend/utils/coordinates.ts` ↔ the same constant in
  `backend/src/common/coordinates.ts`. The backend is the authority (it rejects
  the write); the frontend copy exists so a driver sees the problem while
  typing instead of after a round trip. A drift here is not silent the way the
  service-slug ones are — the frontend simply accepts a point the backend then
  refuses, with a message the driver cannot act on.
- The "pick up to 2 regions" cap lives in `MAX_REGIONS` inside
  `frontend/components/common/ServiceAreaPicker.vue` (the shared picker used by
  BOTH the registration form and the driver dashboard) and in `@ArrayMaxSize(2)`
  on `CreateRegistrationDto.regionSlugs`. Raising the cap means changing both,
  or the API will reject what the form happily lets a driver submit.
- **Registration and the driver dashboard must offer the same fields.** Anything
  asked at sign-up has to be editable afterwards, or the only way to fix a typo
  is to register again — which is exactly what happened before
  `UpdateMyTowTruckDto` was widened. The two genuine exceptions (`slug`,
  main `phone`) are argued in that DTO and are still *displayed* read-only on
  the dashboard. If you add a field to `register.vue`, add it there too.
  `ServiceAreaPicker.vue` and `PlatformDimensionsInput.vue` are shared by both
  forms for exactly that reason.

## Quick map: "I need to..."

| Task | Start here |
| --- | --- |
| Understand request/response flow, mock vs real API | `docs/architecture.md` |
| Show a region/city/district name, or a truck count | `docs/architecture.md` § "Geography: name vs count" |
| Understand a Prisma model or add a migration | `docs/data-model.md` |
| Touch admin login, driver login/passwords, Telegram link | `docs/auth-and-security.md` — in particular the table of `passwordHash`/`mustChangePassword` states: whether a Telegram re-link may overwrite a password is the security boundary of the whole handover, and nothing else in the system would notice if it inverted |
| Touch services/vehicle-types/capacity pickers or filters | `docs/taxonomies.md` |
| Touch service zones (road corridors), settlements/villages, or location search | `docs/locations.md` |
| Touch "Ազատ երթուղիներ" (Free Routes) | `docs/free-routes.md` |
| Touch per-driver statistics / visitor tracking | `docs/analytics.md` |
| Decide whether a field is driver-editable or admin-only | `backend/src/my-tow-truck/dto/update-my-tow-truck.dto.ts` — the boundary and its two exceptions are argued there |
| Touch the base parking coordinates (lat/lng) | `backend/src/common/coordinates.ts` + `frontend/utils/coordinates.ts` — one rule each side, mirrored by hand; the UI is `CoordinatesInput.vue` / `CoordinatesDialog.vue`, shared by registration, the driver dashboard and `/admin` |
| Touch `/evakuator`, PostGIS, or the route-matrix provider | `docs/nearest-search.md` — the two-step design, why the results reuse `TowTruckCard` untouched, and the rule that a straight-line distance never gets a time next to it |
| Find what a specific page/route does | `docs/pages-and-routes.md` |
| Run the app on a local machine | `docs/local-development.md` |
| Make local behave exactly like staging | `docs/local-development.md` § "Mirroring staging locally" — `scripts/refresh-local-db.sh` copies staging (never production), `backend/.env.local.example` lists the four variables that must differ and why |
| Deploy to the VPS | `docs/deployment.md` |
| Test a change against a real backend before it reaches production | `docs/deployment.md` § "Staging environment" — separate checkout, ports `3003`/`4003`, `staging.evakuators.am` |
| Look up an endpoint | `docs/api-reference.md` |
| Add a field to a tow truck response | `docs/api-reference.md` § "List vs detail" — decide card vs detail first |
| Run or add a test, either project | `docs/testing.md` |
| Add a "how many X exist" total next to a paginated admin list | `docs/api-reference.md` § "Pagination" — follow the `/admin/tow-trucks/count` shape, don't bolt a `total` onto the paginated response |
| Add a sidebar/content layout gated by `isDesktop` or another client-only check | `docs/architecture.md` § "A CSS grid with a viewport-conditional child is an SSR bug waiting to happen" |
| Change the platform's own contact number | `frontend/constants/site.ts` — `CONTACT_PHONE` is the only place it's written; phone/WhatsApp/Telegram links are all derived from it in `utils/formatPhone.ts` |

## Commands

```bash
# frontend/
npm run dev      # http://localhost:3002
npm run build    # → .output
npm run lint      # ESLint (also fix: lint:fix)
npm run test      # vitest run — pure-function tests, see docs/testing.md
npm run test:watch

# backend/
npm run start:dev   # http://localhost:4002/api/v1, watch mode
npm run build        # → dist
npm run lint          # ESLint on src/**/*.ts
npm run test           # vitest run — unit tests, no real DB, see docs/testing.md
npm run test:watch
npm run prisma:migrate   # dev: create + apply a new migration
npm run prisma:deploy    # prod: apply existing migrations only
npm run admin:create -- <email> <password>   # create/reset an admin login
```

Both apps have independent lint/build/test — always verify all three after a
cross-cutting change (e.g. anything touching `serviceAreas`, `capacityRange`,
or a Prisma model) even if you only edited one side. Neither test suite talks
to a real database, Supabase, or Telegram — see `docs/testing.md` for what
that does and doesn't prove before you rely on a green run.

## A listing is not a profile

`GET /tow-trucks` returns a deliberately smaller **card** shape, `GET
/tow-trucks/coverage` an even smaller counting shape, and only `GET
/tow-trucks/:slug` a full profile. Adding a field to the card means publishing it
for every driver at once to anyone who calls the endpoint — the list used to
include every driver's secondary phone, WhatsApp, Telegram and email for exactly
that reason. See `docs/api-reference.md` § "List vs detail".

The same rule shows up on the frontend as `TowTruckCard` vs `TowTruck`
(`frontend/types/towTruck.ts`); `TowTruck extends TowTruckCard`, so a card type
accepts a profile but not the reverse.

## Non-obvious things worth knowing up front

- **Nothing backs up the database unless you set up `scripts/backup-db.sh`
  on the server** — see `docs/deployment.md`. Postgres is on the same VPS as
  the app.
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
- **The logo is `frontend/public/evakuators-logo.svg`** (gold truck mark +
  white/gold wordmark, for dark surfaces), with a light-surface companion at
  `evakuators-logo-light-bg.svg` (navy truck + navy wordmark, gold accent
  kept). Both are the single source of truth — the header (`AppHeader.vue`),
  footer (`AppFooter.vue`), the favicon set (`favicon.svg` is the source, every
  raster size is rendered from it — see `docs/pages-and-routes.md` § "The
  favicon set" for the sizes and why they're those sizes), and `og-image.png`
  (all in `frontend/public/`) are all derived from the same truck
  illustration. If the mark ever changes, regenerate all four together, not
  just the header.
