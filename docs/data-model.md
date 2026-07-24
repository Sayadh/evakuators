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
