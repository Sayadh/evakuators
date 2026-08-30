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

A second consequence, newer and easier to trip over: `GET /tow-trucks` is
**general discovery**, and two vehicle types are deliberately not part of it —
see "Two vehicle types are landing-page-only" below.

See `docs/architecture.md` for the full layering and the mock/API switch.

## Manual sync points (no compile-time enforcement)

These pairs must be kept identical by hand. Search both sides before you
assume one is unused:

- `frontend/types/enums.ts` `ServiceType.Available247` value (`'available-24-7'`)
  ↔ `backend/src/tow-trucks/service-slugs.ts` `AVAILABLE_24_7_SLUG`.
- `frontend/types/enums.ts` `VehicleType.Manipulator` value (`'manipulator'`)
  ↔ `backend/src/tow-trucks/vehicle-types.ts` `MANIPULATOR_VEHICLE_TYPE`. The
  `manipulator` boolean is **derived** from `(vehicleType, checkbox)` on both
  sides — either answer is enough — so a mismatch means the filter and the
  stored column disagree for every driver who answered one way. See
  `docs/taxonomies.md` § "«Մանիպուլյատոր» is asked twice".
- `frontend/types/enums.ts` `VehicleType.HeavyDuty` value (`'heavy-duty'`)
  ↔ `backend/src/tow-trucks/vehicle-types.ts` `HEAVY_DUTY_VEHICLE_TYPE`, and
  ↔ `HEAVY_DUTY_PAGE.vehicleType` in `frontend/constants/vehicleTypePages.ts`,
  which is what actually travels as `?vehicleType=`. `/tsanr-tehnika` is the
  same union shape as «Մանիպուլյատոր» — the type OR a boolean — and the boolean
  (`TowTruck.heavyEquipment`) is now **driver-proposed, moderator-decided**: it
  is asked on the registration form and the dashboard, but neither writes it.
  Registration lands in the review queue, and a dashboard save queues a diff, so
  the column still holds only what a human with the whole profile in front of
  them approved — which was always the property that mattered, rather than "no
  driver may write it". It is therefore no longer exempt from the
  registration/dashboard parity rule below. A drift here empties the page rather
  than mis-filling it. See `docs/taxonomies.md` § «Ծանր տեխնիկա». Note the
  stakes changed: those two types are now listed **only** on their own pages, so
  a drift here hides a driver from the whole site rather than from one page.
- `hasUncappedCoverage` in `backend/src/tow-trucks/service-area-limits.ts`
  ↔ the same function in `frontend/constants/serviceAreaLimits.ts`. It decides
  who the coverage cap does NOT apply to — a crane truck or a machinery
  transporter, which is dispatched against a booked job rather than to a
  roadside. The backend copy is the boundary; the frontend copy decides whether
  the driver is ever OFFERED «Ամբողջ Հայաստան» and a free marz list. A drift is
  one-sided and silent in the worst way: a picker that offers a choice the API
  then refuses produces a save that fails over a control the driver used
  correctly. `backend/test/uncapped-coverage.spec.ts` reads the frontend file as
  text. Both sides must be a **union** of the two capability answers, never the
  vehicle type alone — a flatbed with a crane travels for the same jobs.
- `ServiceAreaDto.type`'s fourth member `'region'`
  ↔ `LocationType.Region` in `frontend/types/enums.ts`. Marz-wide coverage,
  written only by an uncapped driver and matched only inside the two specialist
  branches of `buildWhere` — a marz-wide area must never widen a city listing.
- `SPECIALIST_VEHICLE_TYPES` in `backend/src/tow-trucks/vehicle-types.ts`
  ↔ the same constant in `frontend/constants/vehicles.ts`. The backend copy is
  the real boundary (it is what Postgres filters on); the frontend copy is what
  mock mode filters on, so the two modes list the same drivers. A drift means
  local/design work is done against a fleet production does not have.
  `frontend/tests/specialistVehicleTypes.spec.ts` reads the backend file as
  text, and also asserts the list matches `VEHICLE_TYPE_PAGE_LIST` — a type
  listed nowhere but a page that does not exist is a driver hidden from the
  entire site.
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
  See `docs/locations.md` § "Service zones". There is a **third** copy on the
  read side — `ServiceAreaJson.type` in `backend/src/tow-trucks/tow-truck.types.ts`
  — and it had already drifted: it said `'region'`, a value nothing has ever
  written, and omitted `'route'`. Nothing broke, because reads only pass the
  value through; any backend code that branches on the type would have been
  type-checked against a union that does not describe the data.
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
- `TELEGRAM_MESSAGE_MAX_LENGTH` in
  `backend/src/admin/dto/broadcast-message.dto.ts` ↔ the same constant in
  `frontend/constants/admin.ts`. Same asymmetry as the password length above —
  raising it on the frontend only means the textarea accepts a value the API
  then rejects.
- `ARMENIA_BOUNDS` in `frontend/utils/coordinates.ts` ↔ the same constant in
  `backend/src/common/coordinates.ts`. The backend is the authority (it rejects
  the write); the frontend copy exists so a driver sees the problem while
  typing instead of after a round trip. A drift here is not silent the way the
  service-slug ones are — the frontend simply accepts a point the backend then
  refuses, with a message the driver cannot act on.
- The "pick up to 2 regions" cap lives in `MAX_REGIONS` inside
  `frontend/constants/serviceAreaLimits.ts` (read by the shared picker, which
  BOTH the registration form and the driver dashboard use) and in `@ArrayMaxSize(2)`
  on `CreateRegistrationDto.regionSlugs`. Raising the cap means changing both,
  or the API will reject what the form happily lets a driver submit.
- The coverage cap lives twice: `frontend/constants/serviceAreaLimits.ts` and
  `backend/src/tow-trucks/service-area-limits.ts`. Yerevan's districts are
  exempt; everything else costs one, with a budget of **2 when Yerevan is one of
  the chosen regions, 3 for a single marz and 5 for two**, counted across the
  whole selection rather than per region. The "one marz or two" half cannot be
  read from `ServiceAreaDto` alone, so those endpoints also carry a
  validation-only `regionSlugs` array that is never stored.
  The frontend copy decides what a driver is *offered*
  (it greys out checkboxes); the backend copy decides what is *accepted* and is
  the only real boundary. `frontend/tests/serviceAreaLimits.spec.ts` reads the
  backend file as text so the two sets of numbers cannot silently disagree —
  see `docs/locations.md` § "How many places a driver may claim".
- **Registration and the driver dashboard must offer the same fields.** Anything
  asked at sign-up has to be editable afterwards, or the only way to fix a typo
  is to register again — which is exactly what happened before
  `UpdateMyTowTruckDto` was widened. The two genuine exceptions (`slug`,
  main `phone`) are argued in that DTO and are still *displayed* read-only on
  the dashboard. If you add a field to the registration form, add it there too.
  `ServiceAreaPicker.vue` and `PlatformDimensionsInput.vue` are shared by both
  forms for exactly that reason.
- **A field a driver can edit is a field a moderator has to be able to read.**
  Dashboard saves are queued as a diff and reviewed
  (`docs/api-reference.md` § "Driver edits are moderated"), so a new editable
  field needs three things, not one: an entry in `EDITABLE_PROFILE_FIELDS`
  (`backend/src/profile-changes/profile-change-diff.ts` — an allow-list,
  because the diff is spread into a Prisma update on approval), a label in
  `frontend/utils/profileChangeLabels.ts`, and a formatting branch there if its
  raw value is a slug, a boolean or a list. Miss the first and the field is
  silently dropped from every edit; miss the second and a moderator reads a
  column name.
- **Registration and the admin review page are the same form, and that one is
  NOT a manual sync point** — it is the only pair here held by construction
  rather than by discipline, and it should stay that way. One
  `RegistrationProfileDto` is extended by both `CreateRegistrationDto` (adds
  `imageIds`) and `ApproveRegistrationDto` (adds slug/base/description/
  serviceAreas); one `RegistrationFormFields.vue` is rendered by both
  `pages/register.vue` and `pages/admin/registrations/[id].vue`; one
  `utils/registrationForm.ts` holds the blank state and every rule. Add a
  question in those two places and both forms have it. Adding it to a *page*
  instead is the mistake — the other page silently never gets it, and since
  approval publishes the moderator's submission, a field missing there is an
  answer discarded at the moment a profile goes live.
  `frontend/tests/registrationFormParity.spec.ts` fails if either page stops
  using the shared component, state or validator.
- **The privacy-consent text is owned by the backend and mirrored on the
  frontend.** `backend/src/privacy-consent/privacy-consent.text.ts` is the
  canonical wording; it hashes its own copy and stores that hash in every
  consent record, so that string is what a driver's consent legally attests to.
  `frontend/constants/privacyConsent.ts` exists only so the dialog can render
  without a round-trip. A drift between them is a real defect — the driver would
  tick a box next to text that is not the text being recorded — so
  `backend/test/privacy-consent-sync.spec.ts` reads the frontend file as text
  and fails on any paragraph, label or version that moved on one side only.
  **`PRIVACY_POLICY_VERSION` must be bumped in both files together**: bumping
  the frontend alone tells every driver to reload forever, bumping the backend
  alone re-asks them and then rejects their answers. Bumping it at all re-asks
  every driver (that IS the mechanism), so change it when the meaning changes,
  not for a typo fix. See `docs/auth-and-security.md` § "Privacy consent".

## Quick map: "I need to..."

| Task | Start here |
| --- | --- |
| Understand request/response flow, mock vs real API | `docs/architecture.md` |
| Show a region/city/district name, or a truck count | `docs/architecture.md` § "Geography: name vs count" |
| Understand a Prisma model or add a migration | `docs/data-model.md` |
| Redirect a visitor based on whether they are signed in | `docs/auth-and-security.md` § "The redirects are route middleware" — `navigateTo` from a page's `setup()` silently does nothing when it lands inside the router's middleware window, which is a bug with no error message; use `frontend/middleware/driver-{auth,guest}.ts` |
| Touch admin login, driver login/passwords, Telegram link | `docs/auth-and-security.md` — in particular the table of `passwordHash`/`mustChangePassword` states: whether a Telegram re-link may overwrite a password is the security boundary of the whole handover, and nothing else in the system would notice if it inverted |
| Reset a driver's password from `/admin` | `docs/auth-and-security.md` § "The admin reset" — it mints nothing: it puts the row back to "no password" and arms a fresh link, so the password still comes from `handleStart` and there is no second minting path. Both halves are **one** database write (`revokePasswordWithLinkToken`) because either order of two writes can strand a driver with no password and no live link; and it deliberately never messages an already-linked chat, since a driver who lost their Telegram is exactly who needs a reset |
| Broadcast a message to drivers from `/admin` | `docs/auth-and-security.md` § "The admin broadcast" — active + Telegram-linked drivers only, and always an explicit id list an admin ticked, never "everyone": same picker discipline and the same staging-real-chat-ids reasoning as the password broadcast it's modelled on. This is the "third message type" that section's bot-silencing warning asks every addition to justify — the justification is that a human decides per message, unlike the automatic contact notices |
| Touch services/vehicle-types/capacity pickers or filters | `docs/taxonomies.md` — and note that «Մանիպուլյատոր» is asked twice (vehicle type + equipment checkbox) and that every reader must go through `hasManipulator()`/`derivesManipulator()`, never the raw boolean |
| Touch service zones (road corridors), settlements/villages, or location search | `docs/locations.md` |
| Touch "Ազատ երթուղիներ" (Free Routes) | `docs/free-routes.md` |
| Touch per-driver statistics / visitor tracking | `docs/analytics.md` |
| Touch the platform-wide "active callers" number in `/admin` | `docs/analytics.md` § "Platform-wide active callers" — it is a per-truck `PHONE_CLICK` read with the `towTruckId` filter deliberately left out, not a new event type; the two `AnalyticsRepository` methods behind it are the only ones in that class with no truck scope, on purpose |
| Add or change a question on the registration form | `frontend/components/registration/RegistrationFormFields.vue` + `frontend/utils/registrationForm.ts` + `backend/src/registration/dto/registration-profile.dto.ts` — three files, and both the public form and the admin review page get it. Never add a field to `register.vue` or to the review page directly |
| Change how a registration is approved | `docs/api-reference.md` § "Reviewing a registration" — approval carries the **whole profile** as the moderator last saw it, not a stored record plus extras; the request row is left untouched as an audit trail; there is no draft, so leaving the page discards the edits |
| Touch what a driver may change about their own profile | `docs/api-reference.md` § "Driver edits are moderated" — a dashboard save **queues** a diff, it does not write; approval runs `MyTowTruckService.applyUpdate`, the driver's own write path, so there is exactly one implementation of the write |
| Compare a stored value against a submitted one | `backend/src/profile-changes/profile-change-diff.ts` § `isSame` — **never `JSON.stringify`**: `serviceAreas` is a `jsonb` column and Postgres reorders object keys there, so text comparison reported a change on every save. `backend/test/profile-change-jsonb.spec.ts` proves it against a real Postgres |
| Add a field to the moderation diff, or label one | `backend/src/profile-changes/profile-change-diff.ts` (`EDITABLE_PROFILE_FIELDS` — an allow-list, because the diff is spread into a Prisma update on approval) + `frontend/utils/profileChangeLabels.ts` (the Armenian words, which the backend has no taxonomy to produce) |
| Decide whether a field is driver-editable or admin-only | `backend/src/my-tow-truck/dto/update-my-tow-truck.dto.ts` — the boundary and its two exceptions are argued there |
| Touch a driver's base (`citySlug`/`districtSlug`/`locationName`) or the order of a city listing | `docs/locations.md` § "The base" — the base must be one of the served areas (`backend/src/tow-trucks/placement.ts`, one copy for all three write paths), and it **may be a road corridor** — stored as an empty `citySlug`/`districtSlug` plus the corridor's name, so the truck keeps its marz page and has no city page, the label is composed on the frontend because the backend has no geography, and city pages rank locally-based drivers above everyone else in the Recommended order **only** |
| Change a driver's coverage from `/admin` | `docs/locations.md` § "An admin can remove a single area" — the endpoint takes the slug to REMOVE, never the new list, which is what lets it skip the coverage cap; re-read that before making it a general editor |
| Touch the base parking coordinates (lat/lng) | `backend/src/common/coordinates.ts` + `frontend/utils/coordinates.ts` — one rule each side, mirrored by hand; the UI is `CoordinatesInput.vue` / `CoordinatesDialog.vue`, shared by registration, the driver dashboard and `/admin` |
| Touch `/evakuator`, PostGIS, or the route-matrix provider | `docs/nearest-search.md` — the two-step design, why the results reuse `TowTruckCard` untouched, the rule that a straight-line distance never gets a time next to it, and `NEAREST_SEARCH_ENABLED` (currently **on**) — while `false` it pauses the search itself and nothing else, the nav link, the CTA banners and the sitemap entry stay up on purpose, so the page acts as an announcement |
| Change how often a visitor may run the nearest search | `docs/nearest-search.md` § "How often one person may search" — 2/day per browser (`NEAREST_DAILY_SEARCH_LIMIT`) buys **road distances and times**, not searches: past it the page keeps searching, unlimited, sending `skipRouting: true` for a straight-line-only answer, because the PostGIS half is free and an empty screen is the wrong thing to hand someone next to a broken car. **Nothing on this page ever refuses to answer** — a test asserts there is no early exit between reading the limit and calling the API. It is unrelated to `NEAREST_ORS_DAILY_QUOTA` (500, `backend/src/nearest/nearest.constants.ts`), the real daily cap on the OpenRouteService key, tracked **globally, not per IP** — a former per-IP ceiling was removed because a modest number of distinct addresses could collectively exceed a platform-wide budget that a per-IP number couldn't see. Running out of the ORS budget silently degrades the search to straight-line distances (`routed: false`); it never refuses a request or returns a 429. Both the browser allowance and the ORS budget charge for *work done*, never requests received, so a cache hit is free. The browser stores the **answer** and a counter, never the coordinates |
| Find what a specific page/route does | `docs/pages-and-routes.md` |
| Hide a vehicle type from the listings, or work out why one is missing | `docs/taxonomies.md` § "Landing-page-only vehicle types" — `manipulator` and `heavy-duty` are excluded from every general listing, and the exclusion is by the **type column only**, never by `hasManipulator`/`heavyEquipment`; naming a type in `?vehicleType=` is what lifts it |
| Add a general listing, counter or search over tow trucks | It must exclude `SPECIALIST_VEHICLE_TYPES`, the same way it must state `isActive` — see the section above and the five existing call sites |
| Change who appears on `/tsanr-tehnika` | `docs/taxonomies.md` § «Ծանր տեխնիկա» — the page is a **union**: `vehicleType === 'heavy-duty'` OR the admin-set `TowTruck.heavyEquipment` flag, so a long-platform flatbed or a big manipulator can be listed there too. The flag is admin-only (`PATCH /admin/tow-trucks/:id/heavy-equipment`), deliberately never driver-editable, and **derived** — a `heavy-duty` truck is always `true` and the admin checkbox is ticked-and-disabled. The union must stay inside `AND` in `buildWhere`, never joined to the geography `OR` |
| Add or change the SEO copy of a vehicle-type page | `frontend/utils/vehicleTypeSeo.ts` builds every title, description, keyword list, `<h1>` and paragraph for all 24 URLs from two inputs: the type's `seo` vocabulary in `vehicleTypePages.ts` and a `VehicleTypeGeo`. Change the words in the config, never in the builder — the builder knows the shape of a title, only the config knows what a manipulator is |
| Add a marz (or change how one is named on a vehicle-type page) | `VEHICLE_TYPE_GEOS` + `REGION_LOCATIVES` in `frontend/constants/vehicleTypePages.ts`. The list is derived from `staticRegions`, so a new marz appears automatically — but its **locative** («Լոռու մարզում», not «Լոռիի») is hand-written, and a missing entry silently falls back to concatenation in an `<h1>`. Guarded by `tests/vehicleTypeGeoPages.spec.ts` |
| Add a vehicle-type area page, or work out why one is `noindex` | `docs/pages-and-routes.md` § "The area pages" — an area with no drivers is `noindex, follow` and absent from the sitemap, same thin-page rule as the landing settlements; the sitemap decides from the listing walk it already does, never from `/tow-trucks/coverage` (which excludes these trucks by construction) |
| Add or change a vehicle-type landing page (`/manipulator`, `/tsanr-tehnika`) | `docs/pages-and-routes.md` § "Vehicle-type landing pages" — slug, nav label, SEO copy and sitemap entry all come from one entry in `frontend/constants/vehicleTypePages.ts`; these pages show the cards and, below them, an FAQ — and nothing else (no filters, no sort, no CTA, no intro prose — the URL is the filter); the FAQ is there purely for search, so it stays below the listing and its `FAQPage` JSON-LD comes from the same array `FaqSection` renders; the backend filter is `?vehicleType=` on the existing listing endpoint and it must AND with the geography, never join its `OR` |
| Run the app on a local machine | `docs/local-development.md` |
| Make local behave exactly like staging | `docs/local-development.md` § "Mirroring staging locally" — `scripts/refresh-local-db.sh` copies staging (never production), `backend/.env.local.example` lists the four variables that must differ and why |
| Deploy to the VPS | `docs/deployment.md` |
| Test a change against a real backend before it reaches production | `docs/deployment.md` § "Staging environment" — separate checkout, ports `3003`/`4003`, `staging.evakuators.am` |
| Look up an endpoint | `docs/api-reference.md` |
| Add a field to a tow truck response | `docs/api-reference.md` § "List vs detail" — decide card vs detail first |
| Run or add a test, either project | `docs/testing.md` — and note the one exception to "nothing talks to a real database": `backend/test/migrations.pglite.spec.ts` applies every migration against real Postgres (PGlite, in-process) to check the things Prisma's schema cannot express — the partial unique index, the `ON DELETE` behaviours, the absence of a backfill |
| Add a "how many X exist" total next to a paginated admin list | `docs/api-reference.md` § "Pagination" — follow the `/admin/tow-trucks/count` shape, don't bolt a `total` onto the paginated response |
| Add a sidebar/content layout gated by `isDesktop` or another client-only check | `docs/architecture.md` § "A CSS grid with a viewport-conditional child is an SSR bug waiting to happen" |
| Change the order drivers appear in on a listing | `docs/architecture.md` § "The listing order is random" — the order is **shuffled**, not ranked, because a rating-ordered list gave every listing one fixed queue and the drivers below it were never called. Most listings still keep a half-point rating band on top of the shuffle; the city/district search pages (`docs/locations.md` § "The city/district listing order") drop the band but keep a `basePlace` tier — drivers based in the searched town/district first, everyone else after, each tier shuffled. The randomness comes from one `useState` seed per page load, so SSR and the browser agree; shuffle first and sort second, never a random comparator |
| Show a date, a time, a price or any grouped number | `docs/architecture.md` § "Never ask the runtime to localise a string" — `toLocaleDateString`/`toLocaleString`/`Intl.NumberFormat` are banned on anything that reaches the page; use `frontend/utils/formatters.ts` and `formatPrice.ts`, which are pinned to `Asia/Yerevan` and an explicit Armenian month table so SSR and the browser cannot disagree |
| Add or change an allowed CSP host (Google Ads/Analytics/GTM beacon, any third-party script/beacon) | `frontend/nuxt.config.ts` `security.headers.contentSecurityPolicy` — exact host, never a wildcard wider than the one beacon being unblocked (see the comments on `ad.doubleclick.net` and `stats.g.doubleclick.net` for why they're separate entries from each other despite sharing a suffix), and in BOTH `connect-src` and `img-src` if the beacon can be sent either way. Guarded in `frontend/tests/cspApiOrigin.spec.ts` |
| Change whether analytics/Ads tracking loads on a given route | `frontend/plugins/gtag-gate.client.ts` + `frontend/utils/isAdminRoute.ts` — `gtag.initMode: 'manual'` in `nuxt.config.ts` means nuxt-gtag's own plugin never auto-injects the script tag; this plugin is the only caller of `initialize()`, and currently skips it (and calls `disableAnalytics()`) on every `/admin` route. Extending the skip to another route means widening `isAdminRoute`'s equivalent, not editing this plugin's route check inline |
| Change which GA4/Ads id is allowed to fire, or from which hostname | `frontend/utils/shouldLoadGtag.ts` + `ecosystem.config.js`/`ecosystem.staging.config.js` (`NUXT_PUBLIC_GTAG_ID`) — `gtag.id` defaults to `''` in `nuxt.config.ts` (off), same pattern as `apiBaseUrl`; production's real id is written only in `ecosystem.config.js`, and `shouldLoadGtag()` refuses that SPECIFIC id from any hostname but `evakuators.am` even if a config mistake ever carries it into another build. `AW-18328135826` (Google Ads) is not a separate id anywhere in this codebase — it rides the same `gtag('config', 'G-HEN3RVMTRG')` call via a link made in Google's own UI, so this one check controls both |
| Change whether the Meta Pixel loads, or which id/hostname it's allowed to fire from | `frontend/plugins/meta-pixel.client.ts` + `frontend/utils/shouldLoadPixel.ts`, the exact GA4 pattern above applied to a second tracker — id from `NUXT_PUBLIC_META_PIXEL_ID` (`ecosystem.config.js`/`ecosystem.staging.config.js`), off by default, production's real id (`1596253742133677`) pinned to `evakuators.am` by `shouldLoadPixel()`. `PageView` dedup is `frontend/utils/shouldTrackPixelPageView.ts` |
| Change the site-wide cookie/analytics consent gate | `frontend/stores/cookieConsent.ts` (`'pending' \| 'accepted' \| 'rejected'`, localStorage-backed, hydrated by `plugins/initStores.client.ts`) + `frontend/components/common/CookieConsentBanner.vue`. Both `gtag-gate.client.ts` and `meta-pixel.client.ts` refuse to start until `status === 'accepted'`, and each also watches `consent.status` directly so accepting mid-session starts them without a route change. This is separate from `docs/analytics.md`'s per-provider counters, which are first-party and not gated on it at all |
| Change the platform's own contact number | `frontend/constants/site.ts` — `CONTACT_PHONE` is the only place it's written; phone/WhatsApp/Telegram links are all derived from it in `utils/formatPhone.ts` |
| Touch the site's name/brand, `<title>`/`og:site_name`, the manifest, or the `Organization`/`WebSite` JSON-LD | `docs/pages-and-routes.md` § "Brand identity surfaces" — `SITE_NAME` in `frontend/constants/site.ts` is the only place the string is written, and `frontend/tests/brandIdentity.spec.ts` asserts the singular spelling of a similarly-named domain never appears, anywhere, including in comments |
| Edit the production nginx config, or add/change a host redirect | `docs/deployment.md` § "nginx" — `nginx/evakuators.am.conf` is an **example**, never copy it over the server's live file (it would delete certbot's real certificate paths); add only the missing block by hand and run `nginx -t` before reloading |

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

## Two vehicle types are landing-page-only

`manipulator` and `heavy-duty` (`SPECIALIST_VEHICLE_TYPES`) appear on
`/manipulator` and `/tsanr-tehnika` and **nowhere else** — not on a city, marz,
Yerevan or corridor listing, not in the homepage's featured picks, not in the
per-area counters, not in `/evakuator`'s nearest search. Someone browsing a town
or stranded by the roadside is describing an ordinary car, and a truck built to
lift an excavator is not an answer to it.

Three things to hold on to before touching any listing:

- **The rule is the `vehicleType` column alone.** Never
  `derivesManipulator`/`derivesHeavyEquipment` — those ask "can it ALSO do the
  specialist job", which is what the landing pages want and is why a flatbed
  carrying a crane belongs on `/manipulator` *and* on every town page it covers.
  Excluding on the union deletes real supply from the listings.
- **Naming a type lifts the exclusion.** `?vehicleType=` is not general
  discovery, so both landing pages keep their union. That is why the exclusion
  is the LAST branch of `TowTrucksRepository.buildWhere` rather than a line at
  the top.
- **A new general read path has to state it**, the same way it has to state
  `isActive`. There are five today (`buildWhere`, `findCoverage`,
  `findFeaturedCards`, `findCardsByIds`, and the PostGIS query in
  `NearestRepository` — that last one *inside* the SQL, before `LIMIT`, or the
  search silently returns fewer than N drivers). `GET /tow-trucks/:slug` and
  everything under `/admin` are deliberately exempt.

The knock-on nobody expects: the sitemap used to walk `GET /tow-trucks` once,
which would now quietly deindex every specialist profile. It walks the general
listing plus one listing per `VEHICLE_TYPE_PAGE_LIST` entry and dedupes by slug.

The second knock-on is a dead end for the visitor: someone who searched
«էվակուատոր Աբովյան» but needs a crane now sees a listing with no answer in it
and no hint the answer exists. `SpecialVehicleCrossLinks` on every city, marz
and district page is what closes that — and, not by coincidence, is what gives
the 24 vehicle-type URLs their internal links.

Full reasoning in `docs/taxonomies.md` § "Landing-page-only vehicle types"; the
pages themselves in `docs/pages-and-routes.md` § "Vehicle-type landing pages".

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
- **Prisma's `in` filter never matches `null`, and putting `null` inside the
  array is worse than a no-op — it throws `PrismaClientValidationError`.**
  `field: { in: [null, 5] }` is not "match null or 5"; SQL's own `IN` cannot
  express "or null" either way (`x IN (NULL, 5)` is `x = NULL OR x = 5`, and
  `x = NULL` is neither true nor false). Want either: use `OR: [{ field: null
  }, { field: { in: [...] } }]` — see `ImagesRepository.applyGallery` and
  `findUnattachedByIds` for the pattern. The latter got this wrong once (see
  `backend/test/images.repository.spec.ts`): every profile-change approval
  that touched `imageIds` threw an uncaught `PrismaClientValidationError`,
  surfaced to the admin panel as a bare "Internal server error" with no
  detail, for as long as the feature existed.
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
