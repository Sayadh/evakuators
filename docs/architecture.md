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
composables/*.ts      useAsyncData wrappers + derivations (useRegions, useTowTrucksInYerevan, ...)
services/*.ts          business logic + the mock/API switch (isApiEnabled())
repositories/*.ts      the ONLY files that call apiFetch()/$fetch — thin HTTP wrappers
mocks/*.ts              in-memory fixture data, used when no backend is configured
utils/*.ts               pure helpers, no network, no Nuxt context needed
```

Note that not every service method fetches: the location services
(`regions`/`cities`/`districts`) are pure synchronous stat builders that take an
already-fetched coverage list — see "Geography: name vs count" below.

A component should never import a repository directly, and a service should
never import `$fetch` directly — everything HTTP-shaped funnels through
`repositories/apiClient.ts`'s `apiFetch()`. This is what makes the mock/API
switch (below) work transparently: swap `NUXT_PUBLIC_API_BASE_URL` and every
service starts hitting real endpoints with zero component changes.

## Geography: name vs count — the rule that keeps request counts sane

Three ways to get at regions/cities/districts, and picking the wrong one is
expensive:

- **Need a name or a route?** `frontend/utils/geography.ts` — synchronous, pure,
  reads `frontend/data/*` only. Zero network. Includes the shared
  `buildRegionOptions()` / `buildCityOptions()` cascade (Yerevan's "cities" are
  its districts) and `cityOrDistrictLabel()`.
- **Need a `towTruckCount`?** `useRegions()` / `useCitiesByRegion()` /
  `useDistricts()` / `useYerevanTowTruckCount()` — all derived from **one**
  shared `useTowTruckCoverage()` fetch of `GET /tow-trucks/coverage`, with the
  location services (`services/{regions,cities,districts}.service.ts`) reduced to
  pure synchronous stat builders over the records they are handed.
- **Need the trucks themselves?** `useTowTrucksByCity/District/Region`,
  `useTowTrucksInYerevan` — filtered backend requests returning the card shape.

This is not premature optimisation; it fixed a measured problem. Originally each
location service called `towTrucksService.getAll()` itself, and callers that only
wanted labels went through them anyway:

| Page | `GET /tow-trucks` before | after |
| --- | --- | --- |
| `/` | 5 full-fleet (+1 `?yerevan=true`, +1 `/featured`) | 1 coverage (+1 `/featured`) |
| `/about`, `/contact`, `/register` | 2 full-fleet | **0** |
| `/regions` | 2–3 full-fleet | 1 coverage |
| `/yerevan` | 3 full-fleet | 1 coverage + 1 filtered list |
| `/regions/[region]/[city]` | 3 full-fleet | 1 coverage + 1 filtered list |

Three independent causes, all worth knowing about:

1. **`AppFooter` fetched the whole fleet to render plain links.** It lives in the
   default layout, so *every page on the site* downloaded every tow truck —
   twice — for names it gets from static data anyway.
2. **`useAsyncData`'s default is `dedupe: 'cancel'`.** When a second component
   calls the same key, Nuxt **aborts the in-flight request and starts a new
   one**. `useRegions()` is called from three components on the homepage and
   `useDistricts()` from two → 3 + 2 = 5 requests for two distinct keys.
   `useTowTruckCoverage()` sets `dedupe: 'defer'` (later callers await the
   request already in flight) plus `getCachedData` (client-side navigation
   reuses the payload). **Any new shared-key `useAsyncData` in this codebase
   should set both.**
3. **Counting required whole profiles.** Even after collapsing to one request,
   that request was the entire fleet with contacts, descriptions and photo URLs,
   in order to print a number on a card. `GET /tow-trucks/coverage` returns ~11%
   of those bytes and no personal data — see `docs/api-reference.md` § "List vs
   detail".

Region counts must be **distinct trucks**, not the sum of their cities' counts:
a driver covering several cities in one marz would otherwise be counted several
times. That is why coverage returns per-truck records rather than ready-made
totals — the backend has no geography data and cannot know which cities belong
to which marz (see `CLAUDE.md`), while the frontend can and does.

Global components are registered with `pathPrefix: false` in
`nuxt.config.ts`, so e.g. `frontend/components/location/RegionCard.vue` is
used in templates as bare `<RegionCard>`, not `<LocationRegionCard>`. Keep
this in mind when grepping for a component's usage — the folder name isn't
part of the tag name.

## The mock/API switch — read this before debugging "why is data wrong"

`frontend/repositories/apiClient.ts`:

```ts
export function isApiEnabled(): boolean {
  return useRuntimeConfig().public.apiBaseUrl.length > 0   // NUXT_PUBLIC_API_BASE_URL
}
```

Note it reads the **public** URL specifically, not `getApiBase()`. Those are
not the same value: `getApiBase()` returns `NUXT_INTERNAL_API_BASE_URL` during
SSR when that is set (a loopback address straight to the backend — see
`docs/auth-and-security.md` § "SSR is exempt"), and the public URL in the
browser. The mock/live decision has to come out identical on both sides or SSR
renders one dataset and hydration replaces it with the other.

Every service (`frontend/services/*.service.ts`) branches on this at the top
of nearly every method:

```ts
getByCitySlug(citySlug: string): Promise<TowTruckCard[]> {
  if (isApiEnabled()) return towTruckRepository.getByCity(citySlug)
  return mockRequest(() => mockTowTrucks.filter((truck) => servesCity(truck, citySlug)))
}
```

- `NUXT_PUBLIC_API_BASE_URL` **empty** → the entire site runs on
  `frontend/mocks/towTrucks.ts` (~130 fixture tow trucks: a couple dozen
  hand-authored ones plus a generated "filler fleet" — `generateFillerFleet()`
  — that pads out per-region counts to look realistic in screenshots/demos)
  and the static `frontend/data/*` geography. No backend needed at all — this
  is how the frontend can be developed and deployed as a pure static-feeling
  site.
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
`my-tow-truck`, `registration`, `reviews`, `images`, `free-routes`, `analytics`,
`telegram`, `health`, `storage`, `prisma`), each wired in
`backend/src/app.module.ts`. `analytics` is the one module with three
controllers, because it serves three different authorisation models (anonymous
writes, driver-scoped reads, admin-scoped reads) over one service layer — see
`docs/analytics.md`.
`admin-auth` is the biggest one in practice — it owns admin login **and**
optional Telegram 2FA **and** the separate admin-bot webhook controller (see
`docs/auth-and-security.md`), there's no standalone `admin-telegram` module.

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
- `ScheduleModule.forRoot()` powers four `@Cron()` jobs — free-route expiry,
  orphaned-image purge, analytics retention and login-code cleanup. They are
  listed with their schedules in `docs/deployment.md` § "Scheduled jobs".
  `instances: 1` in `ecosystem.config.js` is load-bearing for all of them.
- `app.set('trust proxy', 1)` in `main.ts` is what makes every `@Throttle`
  per-client rather than one global bucket — see `docs/auth-and-security.md`
  § Throttling before touching it.

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
builds all JSON-LD structured data: `buildSiteIdentitySchema()` (single
`Organization` + `WebSite` `@graph`, homepage only — see
`docs/pages-and-routes.md` § "Brand identity surfaces") and
`buildTowTruckBusinessSchema()` for individual tow truck profiles, plus
`BreadcrumbList`/`FAQPage` builders used across several pages.

## Never ask the runtime to localise a string

**`toLocaleDateString`, `toLocaleString` and `Intl.NumberFormat` are banned for
anything that reaches the page.** Format through `frontend/utils/formatters.ts`
(dates, counts) and `frontend/utils/formatPrice.ts` (prices) instead.

SSR means two JavaScript runtimes render the same component: Node on the VPS,
and the visitor's browser. They have different ICU builds and different
defaults, and ECMA-402 says a runtime that lacks the requested locale silently
falls back to **its own**. So the same call produced different output on each
side, and Vue reported `Hydration completed but contains mismatches`:

| | Server | A browser set to Russian |
| --- | --- | --- |
| `toLocaleString('hy-AM', …)` | `օգոստոսի 7, 20:15` | `7 августа в 20:15` |
| `Intl.NumberFormat('hy-AM')` | `15 000` | `15 000` — but `15,000` under `en-US` |

Three things make this worse than it looks:

- **The server row is also wrong.** `օգոստոսի 7` is English word order; Armenian
  is `7 օգոստոսի`. There was no locale string that would have fixed it — asking
  ICU was the mistake, not the argument passed to it.
- **It was a factual error, not a cosmetic one.** Without a pinned `timeZone`,
  a departure time rendered in the *reader's* zone: one route read `20:15` in
  Yerevan, `16:15` in London and `01:15 on the 8th` in Tokyo. Only one of those
  is when the driver actually leaves.
- **Prices reached the homepage.** `TowTruckCard` renders there, so the
  most-visited page mismatched for anyone whose browser grouped with a comma.

The replacements build every string from an explicit Armenian month table and
plain digits, and read wall-clock fields through one formatter pinned to
`timeZone: 'Asia/Yerevan'`, `hourCycle: 'h23'` and `numberingSystem: 'latn'`.
Output is then identical in every runtime by construction rather than by hoping
two CLDR versions agree. `frontend/tests/formatters.spec.ts` asserts both the
values and — since the failure only shows on a machine configured unlike the
developer's — that the banned calls do not reappear in the source.

Armenian labels living in the frontend as constants is the same rule the rest
of this project already follows (see CLAUDE.md); dates and prices were simply
the last place still delegating it to a library.

## The listing order is random, and the seed is why that is SSR-safe

Drivers are shown in a shuffled order rather than ranked by rating. The reason
is a marketplace one: the smoothed score separated them by hundredths, so every
listing had one fixed queue — the same two or three profiles on top of it every
time, and everyone below never called, so never reviewed, so never moved. See
`sortTowTrucks` for the full argument.

Most listings still keep one coarse group on top of the shuffle — a half-point
rating band (`tiered: true`, the default). The city and district search pages
(`/regions/[region]/[city]`, `/yerevan/[district]`) are the exception: they
call `applyTowTruckFilters`, which passes `tiered: false`, so the rating band is
skipped and rating plays no part in the order. Those two pages keep a different
tier instead: `basePlace` (see `isBasedAt`) puts drivers actually based in the
town/district being searched ahead of everyone who merely also covers it — a
search for one town means that town's own drivers first — and only within each
of those two groups is the order the shuffle itself.

The part that matters architecturally is how the randomness survives hydration.
`Math.random()` at render time produces one order on the server and another in
the browser, which is the same class of bug as runtime-localised dates above,
with the same symptom: Vue force-patches the DOM, or the list visibly reshuffles
a moment after the page appears.

So there is exactly one random number per page load, `useListingShuffleSeed()`,
and it is a `useState` — created on the server and serialised into the Nuxt
payload, so the browser reads the same value instead of inventing its own. Every
listing derives its order from it, and `seededShuffle` is deterministic given a
seed.

Three rules follow, and each is guarded by
`frontend/tests/listingShuffle.spec.ts`:

- **Read the seed in setup**, never inside a `useAsyncData` transform or a
  computed's getter — `useState` needs a Nuxt context and those run outside one.
  The listing composables capture it and close over it.
- **Shuffle first, then sort.** A comparator that returns random values is not a
  comparator; the sort contract requires consistency. `Array.prototype.sort` is
  stable, so sorting the already-shuffled array by the grouping keys leaves the
  shuffled order intact within a group.
- **The price sort is never shuffled.** The customer asked for cheapest first.

## A CSS grid with a viewport-conditional child is an SSR bug waiting to happen

`useResponsiveFilters()` (`frontend/composables/useResponsiveFilters.ts`)
exposes `isDesktop` from `useMediaQuery('(min-width: 1024px)')`. On the
server, and on the client's very first paint before hydration completes,
there is no viewport to query — `isDesktop` is `false` no matter what device
is actually asking. Any `v-if="isDesktop"` therefore renders as absent in
the HTML that first reaches the browser, full stop, regardless of screen
size.

That is fine for the sidebar itself (`pages/regions/[region]/[city].vue`,
`pages/yerevan/[district].vue`): a missing `<aside>` is invisible. It is
**not** fine when that sidebar is one cell of a CSS grid:

```scss
&__layout {
  display: grid;
  @media (min-width: 1024px) {
    grid-template-columns: 300px 1fr;   // [sidebar] [results]
  }
}
```

With the `<aside>` absent, `__results` is the grid's only child, and CSS
grid auto-placement drops the sole child into the **first** track — the
300px column meant for the sidebar — not the `1fr` column meant for it. A
three-column card grid squeezed into 300px renders as a strip of ~90px
cards, for as long as hydration takes to run and mount the real sidebar.
Slow hydration (a cold dev server, a production API reached over the
network instead of loopback) turns "for as long as hydration takes" into
something a real visitor can see and screenshot.

Both pages now pin the results column explicitly, so the server-rendered
HTML is correct before any JavaScript runs:

```scss
&__results {
  @media (min-width: 1024px) {
    grid-column: 2;   // correct even with zero grid children before it
  }
}
```

**The general rule, for any future sidebar-plus-content layout on this
site:** if a grid or flex container has a child gated by `v-if="isDesktop"`
(or any other client-only viewport check), every *other* child's position
in that container must be pinned explicitly (`grid-column`, `order`, or
equivalent) rather than left to auto-placement. Auto-placement is only safe
when every child that affects layout is always present in the DOM.
