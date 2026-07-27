# Data model

Source of truth: `backend/prisma/schema.prisma`. This doc explains the *why*
behind each model and the slug-referencing convention — read the schema file
itself for exact field types/defaults.

## The slug convention (read this first)

Every field ending in `Slug` (`regionSlug`, `citySlug`, `districtSlug`,
`vehicleType`, and entries inside the `services` string array) is a **plain
string with no foreign key**, referencing a constant defined in the frontend
(`frontend/data/*.ts`, `frontend/constants/*.ts`, `frontend/types/enums.ts`).
The backend does not validate that a slug corresponds to something real
beyond basic string constraints (length, kebab-case pattern where relevant).

This is deliberate — see `CLAUDE.md` § "Core architectural decision" — but it
means:
- The backend can happily store `citySlug: "nonexistent-place"` — nothing
  stops it. Bad data here comes from a frontend bug, not a backend one.
- Renaming a slug in the frontend constants **silently orphans** any DB rows
  still using the old slug. There is no migration tooling for this; it hasn't
  come up yet because the taxonomies have been append-only so far.

## `TowTruck` — the core entity

A published, live evacuator profile. Created only via
`AdminService.approve()` (turning a `RegistrationRequest` into a `TowTruck`)
— there is no direct "create tow truck" endpoint, by design (see
`docs/auth-and-security.md` for why registration always goes through
moderation).

Notable fields beyond the obvious:
- `capacityTons: Float` — an exact number, always. Contrast with
  `RegistrationRequest.capacityRange` (a band slug like `"3.5-5"`) — see
  `docs/taxonomies.md` for how one becomes the other at approval time.
- `locationName: String` — free-text display label for where the truck is
  actually based (e.g. "Նոր Նորք"), filled in by the admin at approval time.
  Independent of `citySlug`/`districtSlug`, which are a best-effort structural
  placement (defaulted to the driver's first listed service area) used only
  for the region/city browsing pages' filtering fallback — not shown to users
  directly.
- `serviceAreas: Json` — `[{ slug, name, type: "city" | "district" }]`. The
  `name` is resolved to a real Armenian label **by the admin frontend** at
  approval time (`cityOrDistrictLabel()` in `pages/admin.vue`) and sent
  as-is — the backend just stores whatever it's given. If this ever regresses
  to storing `name: slug`, you'll see raw English slugs on public profiles
  (this exact bug happened once — see git history around
  `backend/src/admin/dto/approve-registration.dto.ts`'s `ServiceAreaDto`).
- `works24Hours: Boolean` — derived, not directly editable. It mirrors
  whether `AVAILABLE_24_7_SLUG` is present in `services[]`. Kept as a real
  column purely so Postgres can `ORDER BY works24Hours DESC` cheaply for the
  "24/7 trucks first" sort. Both `AdminService.approve()` and
  `MyTowTruckService.updateMine()` recompute it whenever `services` changes —
  never trust a stale `works24Hours` if `services` was touched without going
  through one of those two paths.
- `telegramChatId` / `telegramLinkToken` / `telegramLinkTokenExpiresAt` —
  driver login state. See `docs/auth-and-security.md`.
- `isFeatured: Boolean` — admin-only toggle (`PATCH
  /admin/tow-trucks/:id/featured`), unrelated to `works24Hours` or approval
  status. Drives `GET /tow-trucks/featured` (public) and the homepage
  "featured trucks" section; nothing sets it automatically, an admin has to
  flip it in `/admin`. Defaults `false`, no cap on how many can be featured
  at once.
- `workingHoursText: String?` — free-text working hours (e.g. `"09:00 – 21:00"`),
  entirely optional. `null`/unset means "not specified" and the frontend
  hides the hours line completely rather than showing a placeholder or a
  fake default — a real bug that shipped once (a hardcoded `HOURS_DAY`
  fallback was displayed for every truck regardless of truth) before this
  field existed. When set, it's validated against `WORKING_HOURS_PATTERN`
  (`^\d{2}:\d{2}\s[–-]\s\d{2}:\d{2}$`, exported from
  `create-registration.dto.ts`) — both the registration form and the driver
  dashboard collect it as two separate `<input type="time">` fields and join
  them into this exact format client-side
  (`frontend/utils/workingHours.ts`'s `formatWorkingHoursRange`/
  `splitWorkingHoursRange`). If `works24Hours` is true, this field is ignored
  for display purposes (the UI shows "Շուրջօրյա (24/7)" instead) but isn't
  cleared server-side. Neither this field nor the 24/7 toggle is required —
  a driver can leave both unset.
- `isActive: Boolean` — soft hide/ban. `false` hides the truck from every
  public query (`TowTrucksRepository.findMany`/`findBySlug` filter on it) and
  makes the driver's still-valid JWT stop working (`MyTowTruckService.getMine`
  throws `ForbiddenException` even with a technically-valid token) and blocks
  new OTP requests (`DriverAuthService.requestCode` checks it via
  `findByPhone`, which itself filters `isActive: true`).

## `RegistrationRequest`

What a driver submits from `/register`, before any admin has looked at it.
`status: PENDING | APPROVED | REJECTED`. On approval
(`AdminService.approve()`), a new `TowTruck` is created from it inside a
`$transaction` (along with re-pointing any uploaded `TowTruckImage` rows from
`registrationRequestId` to the new `towTruckId`) and the request's status
flips to `APPROVED`. The request row itself is kept forever (audit trail) —
nothing deletes `RegistrationRequest` rows.

`capacityRange` here is a **band slug** (driver only picks a range at
registration), not the same shape as `TowTruck.capacityTons` (an exact
float) — see `docs/taxonomies.md`.

`workingHoursText` is collected here in the same optional/validated format
described under `TowTruck` above, and copied over as-is by
`AdminService.approve()` — the admin doesn't re-enter it.

## `TowTruckImage`

Nullable FKs to *both* `TowTruck` and `RegistrationRequest` (never both
non-null at once in practice) — reflects the upload-before-attach flow in
`docs/architecture.md`'s image pipeline. `onDelete: Cascade` from `TowTruck`,
`onDelete: SetNull` from `RegistrationRequest` (rejecting a request doesn't
need to delete its images immediately).

## `Review`

Customer-submitted, always created with `isApproved: false`
(`ReviewsService.create()`), only visible publicly once an admin approves it
via `/admin/reviews/:id/approve`. Rejecting a review **deletes** the row
outright (no "rejected" status kept around).

## `FreeRoute`

See `docs/free-routes.md` for the full feature — this is the newest model
and has the most interesting lifecycle (cron-driven state machine).

## `DriverOtp`

One row per requested login code, never reused. `codeHash` is
`sha256(code + pepper)`, never the raw code. `attempts` counts failed
`verifyCode()` calls against *this specific* OTP row (locks out at 5).
`consumedAt` is set both on successful verification and when a newer OTP is
requested (`DriverOtpRepository.invalidateActive()`), so a driver can never
have two "active" codes at once. See `docs/auth-and-security.md`.

## `AnalyticsDailyStat` / `AnalyticsVisitorDay`

Per-tow-truck visitor statistics — see `docs/analytics.md` for the full
feature. Two tables with deliberately different lifecycles:

- **`AnalyticsDailyStat`** — pre-aggregated counters, one row per
  (tow truck, Armenia calendar day, `AnalyticsEventType`). The only table the
  dashboards read. `eventCount` is **already deduplicated**: it means "how
  many distinct visitors did this on this day", never "how many times was the
  button pressed". Kept forever.
- **`AnalyticsVisitorDay`** — the dedup ledger, one row per
  (tow truck, day, event type, hashed visitor). Its unique constraint is what
  enforces the once-per-visitor-per-calendar-day rule **in the database**
  rather than in application code, which is what makes it race-proof. Purged
  by a daily cron after `ANALYTICS_VISITOR_DAY_RETENTION_DAYS` (180) — this is
  the only analytics table that grows with traffic.

`visitorKey` is `sha256(rawVisitorId + pepper)`; the raw browser id is never
stored. `statDate` is a plain Postgres `DATE`, always resolved in
`Asia/Yerevan` by `AnalyticsClock` — never taken from the client, or the
once-per-day rule could be bypassed by sending a different date each time.

Both cascade from `TowTruck`, so `AdminService.deleteTowTruck()` needs no
extra cleanup step.

Index rationale (each index does double duty — see `docs/analytics.md`):
`AnalyticsDailyStat`'s unique key is both the UPSERT conflict target and the
dashboard read index; `AnalyticsVisitorDay`'s unique key deliberately puts
`visitorKey` last so the same index answers `COUNT(DISTINCT visitorKey)` as an
index-only scan.

## `User`

Admin accounts only (`role: ADMIN` is the only enum value that exists so
far — the enum is a placeholder for a future role, not evidence multiple
roles are handled anywhere in the code today). No self-registration —
created exclusively via `backend/scripts/create-admin-user.js`
(`npm run admin:create -- <email> <password>`), which upserts by email so
re-running it is how you reset a forgotten password. The Prisma schema
comment on this model still says "auth is not implemented yet" — that's
stale; admin auth has been implemented since (`admin-auth` module,
`AdminJwtGuard`). Don't take schema comments as gospel over the actual code.

## Migrations

Hand-authored SQL files in `backend/prisma/migrations/`, matching Prisma's
generated style (`-- CreateEnum`, `-- CreateTable`, `-- CreateIndex`,
`-- AddForeignKey`). Apply with `npx prisma migrate deploy` in production
(applies pending migrations only, never generates new ones) or
`npm run prisma:migrate` (`prisma migrate dev`) locally when you've changed
`schema.prisma` and want a new migration generated + applied in one step.

Always run `npx prisma generate` after pulling schema changes, before
building — see `docs/deployment.md`'s "stale Prisma Client" gotcha.
