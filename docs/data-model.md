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

`TowTruck.serviceAreas` (JSONB) carries a `GIN (jsonb_path_ops)` index, because
every city/district/region listing filter is
`citySlug = ? OR serviceAreas @> ?` (see `TowTrucksRepository.buildWhere`) and the
JSONB half had no index at all — the planner fell back to a Seq Scan with a
containment test per row. Measured on 20k rows with 5 matches: 5.8ms Seq Scan →
0.07ms Bitmap Index Scan. `jsonb_path_ops` rather than the default `jsonb_ops`
because `@>` containment is the only operator used, and it builds a much smaller
index for exactly that.

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
  actually based (e.g. "Նոր Նորք"), set by the admin at approval and editable
  by the driver afterwards. Independent of `citySlug`/`districtSlug`, which are
  a best-effort structural placement (defaulted to the first listed service
  area) used only for the region/city browsing pages' filtering fallback — not
  shown to users directly.
- `serviceAreas: Json` — `[{ slug, name, type: "city" | "district" }]`. The
  `name` is resolved to a real Armenian label **by whichever frontend is
  writing** — the admin review page at approval, `pages/dashboard.vue` when the
  driver edits their own coverage — and sent as-is; the backend just stores
  what it is given, because it has no geography data to resolve names with.
  Both paths validate against the shared `ServiceAreaDto`
  (`backend/src/tow-trucks/dto/service-area.dto.ts`). If this ever regresses to
  storing `name: slug`, you'll see raw English slugs on public profiles (this
  exact bug shipped once).

  Changing `serviceAreas` and changing `citySlug`/`districtSlug`/`regionSlug`
  is **one decision, not two**: `MyTowTruckService.updateMine()` rejects an
  update that sends the JSON list without a structural placement, because the
  two describing different geography is how a truck ends up filtered into a
  city it no longer serves.
- `works24Hours: Boolean` — derived, not directly editable. It mirrors
  whether `AVAILABLE_24_7_SLUG` is present in `services[]`. Kept as a real
  column purely so Postgres can `ORDER BY works24Hours DESC` cheaply for the
  "24/7 trucks first" sort. Both `AdminService.approve()` and
  `MyTowTruckService.updateMine()` recompute it whenever `services` changes —
  never trust a stale `works24Hours` if `services` was touched without going
  through one of those two paths.
- `latitude` / `longitude` (`Decimal(9,6)?`) + `locationUpdatedAt` — where the
  truck is actually parked, as a point. The input for the future "nearest
  evacuator to this customer" calculation; **not** live tracking, it changes
  only when a driver or an admin edits it. Independent of the
  `regionSlug`/`citySlug`/`districtSlug` placement and of `locationName`, which
  are a slug and a label respectively and cannot be measured against anything.

  Three things about these columns that are decisions, not defaults:

  - **Two numeric columns, never one string.** A `"40.1792, 44.4991"` text
    column cannot be compared, indexed or fed to a distance formula without
    being parsed back apart — exactly what `platformDimensions` cost before it
    became two floats (see `RegistrationRequest` below). The single text box a
    driver types into exists only in the browser; `parseCoordinates()`
    (`frontend/utils/coordinates.ts`) splits it before submit.
  - **`Decimal`, not `Float`.** Six decimal places is ~0.11 m of resolution, and
    an exact decimal type means a coordinate reads back exactly as entered.
    Prisma returns `Prisma.Decimal`, whose `toJSON()` is a **string** — so every
    mapper converts with `decimalToNumber()` (`backend/src/common/coordinates.ts`)
    rather than handing the column straight to a response.
  - **Nullable, and staying that way.** Every driver approved before this
    feature has none, and **registration does not require them either**.
    `locationUpdatedAt` is null exactly when the pair is.

    That last part was the other way round at first, and the reversal is worth
    knowing before anyone re-tightens it. Requiring the field looked like it
    closed the gap; what it actually did was put the form's hardest step —
    copying a coordinate out of Google Maps on a phone — in front of the only
    route onto the platform, so a driver defeated by it was lost entirely
    rather than arriving with one field to fill in later. And because the field
    could not be skipped, the form told a stuck driver to paste the *example*
    coordinate, which parked them in the centre of Yerevan and ranked them
    against customers nowhere near — a wrong value nothing downstream can tell
    from a real one. A NULL is visibly missing and fixable from the driver's own
    dashboard; a plausible wrong number is neither.
  - **Written and cleared as a pair.** One axis alone describes no place, and a
    row holding half a coordinate is neither "has a location" nor "has none" for
    every reader downstream. Enforced at each entry point (`RegistrationService`
    rejects a lone axis; `SetCoordinatesDto` has both fields required), never by
    the columns.

  A third column, `location` (`geography(Point, 4326)`), is the PostGIS
  projection of the two above — `GENERATED ALWAYS ... STORED`, so Postgres
  recomputes it on every write and it cannot disagree with the numbers. It is
  what the nearest-driver search reads, via a partial GiST index, and it is
  declared in `schema.prisma` as `Unsupported(...)` only so schema and database
  agree. It is never written from application code and there is no typed path to
  it. See `docs/nearest-search.md` § PostGIS, including why
  `prisma migrate dev` must never regenerate it.

  **Withheld from every public response.** `toTowTruckApi` serves both
  `GET /tow-trucks/:slug` and `GET /my/tow-truck`; it takes an
  `includeCoordinates` option that defaults to **false**, so only the driver's
  own profile and the admin list carry them. See `docs/api-reference.md`
  § "List vs detail" — a field that is in the JSON but not on the page is
  published all the same.
- `telegramChatId` / `telegramLinkToken` / `telegramLinkTokenExpiresAt` —
  driver login state. See `docs/auth-and-security.md`.
- `contactNoticeIntroAt` — the atomically-claimed marker that keeps the
  one-time explanation attached to a driver's FIRST contact notice only. There
  is deliberately no companion opt-out column: the notices are not optional.
  Full reasoning, and the login-outage risk that comes with that, in
  `docs/analytics.md` § "Side effect: driver contact notices".
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
  new logins (`DriverAuthService.login` looks the truck up via
  `findActiveByMainPhone`, which itself filters `isActive: true`).
- `passwordHash: String?` / `mustChangePassword: Boolean` — driver login
  credentials. NULL hash means "never tapped their Telegram link", which is the
  same thing as "cannot log in yet": the link is the only channel that mints a
  password. `mustChangePassword` is true exactly while the hash holds a
  generated password, and it is what stops a Telegram re-link from being a
  password reset once a driver has chosen their own. See
  `docs/auth-and-security.md` for the full table of states.

### Read shapes

`TowTruck` is read through three different Prisma `select`s, not one:
`CARD_SELECT` (listings — no description, no secondary contacts, one image row),
`COVERAGE_SELECT` (five columns, for the geography counters) and a full
`include: { images: true }` for a single profile. The narrowing happens in
Postgres rather than in a mapper, so the wide columns are never read off disk for
a listing. See `docs/api-reference.md` § "List vs detail".

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

`platformLengthM` / `platformWidthM` are the **same two `Float?` columns**
`TowTruck` has, so `approve()` copies them straight across like
`winch`/`manipulator`.

`TowTruck.heavyEquipment` has **no counterpart here on purpose.** It is the one
boolean on a truck that is not a driver answer — an admin sets it, and
`approve()` derives it from the vehicle type alone rather than copying a
column that does not exist. See `docs/taxonomies.md` § «Ծանր տեխնիկա» for why
this judgement is not the driver's to make.

They used to be one free-text `platformDimensions` string (`"5.5 մ × 2.2 մ"`),
and that single decision cost a format regex, a parser, and a conversion step
at approval — a step which for a long time simply wasn't written, so the answer
was collected from every driver and shown to nobody. Both forms now ask for two
numbers (`PlatformDimensionsInput.vue`), so there is no format for a driver to
get wrong and nothing left to parse. `frontend/utils/platformDimensions.ts` is
now display formatting only.

`regionSlugs: String[]` — up to 2 marzes (e.g. Yerevan + Kotayk), enforced by
`CreateRegistrationDto`'s `@ArrayMaxSize(2)`. Was a single `mainRegionSlug`
column; `citySlugs` can now hold a **mix** of real cities and Yerevan
districts (one region's "cities" if Yerevan is one of the two picks), so
nothing downstream may assume "all of `citySlugs` is the same type" — see the
`slugType()` helper in `AdminService.approve()`'s frontend caller
(`admin.vue`) for the per-slug resolution this requires. `TowTruck.regionSlug`
itself stays a single column: the admin resolves it at approval time from
whichever region the chosen `citySlug`/`districtSlug` actually belongs to
(`ApproveRegistrationDto.regionSlug`, resolved via `findCityLocation()` on the
frontend, since the backend has no geography data of its own), the same
pattern already used for `citySlug`/`districtSlug`/`serviceAreas` names.

`workingHoursText` is collected here in the same optional/validated format
described under `TowTruck` above, and copied over as-is by
`AdminService.approve()` — the admin doesn't re-enter it.

`latitude` / `longitude` are the **same two `Decimal(9,6)?` columns**
`TowTruck` has, so `approve()` copies them straight across like
`platformLengthM`/`platformWidthM` and stamps `TowTruck.locationUpdatedAt` at
that moment. The columns are nullable here too, and stay empty whenever the
driver skipped the field — it is optional at sign-up (see `TowTruck` above for
why). The admin does not re-enter them at approval, so a truck approved from a
request with no coordinates simply starts without them; the paths to fill them
in afterwards are the driver's own dashboard or
`PATCH /admin/tow-trucks/:id/coordinates`.

## `TowTruckImage`

Nullable FKs to *both* `TowTruck` and `RegistrationRequest` — reflects the
upload-before-attach flow in `docs/architecture.md`'s image pipeline. **After
approval both are set**: `AdminService.approve()` only writes `towTruckId` and
deliberately leaves `registrationRequestId` in place, so the request keeps a
record of which photos it was submitted with. That is exactly why
`ImagesRepository.findOrphaned()`'s "rejected application" branch is scoped
with `towTruckId: null` — without it, rejecting an already-approved request
would make a live truck's photos look like a rejected application's.

`onDelete: Cascade` from `TowTruck`, `onDelete: SetNull` from
`RegistrationRequest` (rejecting a request doesn't need to delete its images
immediately).

**`position` is the driver's own order, and index 0 is the main photo.** It is
written from the array index in exactly two places —
`RegistrationRepository.create()` (from the ordered `imageIds` the form
submits, main file first) and `ImagesRepository.applyGallery()` (the dashboard's
full replacement list). Approval deliberately does *not* touch it: it only
re-points `towTruckId`, so the photo the driver chose stays the main photo when
their profile goes live.

Every query that returns images must order by `IMAGE_ORDER`
(`backend/src/images/image-order.ts`), never by `position` alone. Rows created
before `position` was actually written all carry the column default of `0`, so
`position`-only ordering leaves them in whatever order Postgres feels like
returning — which really did differ between two runs of the same query, making
"the main photo" and the listing thumbnail unstable. The `id` tiebreak resolves
that legacy data to upload order, which is the order the driver submitted.

**Orphan cleanup (`ImagesService.purgeOrphanedImages`, daily 03:00).** Two kinds
of row belong to nothing a user can reach, and until this job existed neither was
ever deleted — from the database *or* from Supabase Storage:

- **Never attached.** `POST /images` inserts the row before the registration form
  is submitted, so an abandoned upload leaves both FKs null forever. That endpoint
  is public by necessity (it runs before a driver has any credentials) and accepts
  30MB files, which made it the only path in the system where an anonymous
  request permanently costs money. Removed after 24h — long enough that a driver
  can take their time between picking photos and submitting.
- **Attached to a REJECTED request.** `AdminService.reject()` intentionally keeps
  the `RegistrationRequest` row as an audit trail, but the photos have no further
  use. Removed 7 days after the rejection, in case an admin wants a second look.

The job deletes the Storage objects **before** the rows, and bails out keeping the
rows if Storage fails: `path` is the only record of which bucket object belongs to
which row, so dropping the row first would strand the file permanently — exactly
the problem the job exists to fix.

**This job is the single owner of Storage deletion for photos a driver removes.**
When a driver drops a photo from their gallery, `MyTowTruckService` only
*detaches* the row (`ImagesRepository.detachFromTowTruck` clears both FKs), which
makes it match the "never attached" branch above and get cleaned up on the next
nightly run. It used to delete the row and then call Storage itself — the wrong
order, so a transient Supabase failure discarded `path` while the file was still
in the bucket and leaked it with nothing left to find it by. The trade-off is
that a removed photo sits in the bucket for up to ~24h; it is unreferenced by
then, and it is the same window abandoned uploads already have.

The one remaining exception is `AdminService.deleteTowTruck()`, which removes the
Storage objects itself (correct order, tolerating failure) because the admin
explicitly asked for the data to be gone now rather than tomorrow. `TowTruck`
deletion cascades the rows.

## `SiteDailyStat` / `SiteVisitorDay`

The two tables above with the tow truck removed — site-wide traffic for the
admin panel (visits, Free Routes views). Same one-statement CTE dedup, same
hashed visitor key, same retention purge. Why they are separate tables rather
than a nullable `towTruckId` on the per-truck pair is argued in
`docs/analytics.md` § "Site-wide traffic (admin panel)".

## `Review`

Customer-submitted, always created with `isApproved: false`
(`ReviewsService.create()`), only visible publicly once an admin approves it
via `/admin/reviews/:id/approve`. Rejecting a review **deletes** the row
outright (no "rejected" status kept around).

## `FreeRoute`

See `docs/free-routes.md` for the full feature — this is the newest model
and has the most interesting lifecycle (cron-driven state machine).

## `AdminOtp`

One row per requested admin 2FA code, never reused. `codeHash` is
`sha256(code + pepper)`, never the raw code. `attempts` counts failed
`verifyCode()` calls against *this specific* row (locks out at 5). `consumedAt`
is set both on successful verification and when a newer code is requested, so an
admin can never have two "active" codes at once. See
`docs/auth-and-security.md`.

Rows older than 24h are deleted daily by
`AdminAuthService.purgeSpentLoginCodes`. Nothing was deleting them before, so
the table grew by one row per login attempt forever. A spent code has no audit
value: the hash is one-way.

There used to be a `DriverOtp` twin, and the cron lived in `DriverAuthService`
so one job could sweep both. Drivers moved to password login (see
`docs/auth-and-security.md`), the table was dropped in
`20260806120000_driver_password_login`, and the cron moved here next to the only
table it still has to clean. Admins keep codes because for them a code is a
**second** factor on top of a password, not the password's replacement.

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
re-running it is how you reset a forgotten password. Auth is
`admin-auth`/`AdminJwtGuard`, plus the Telegram-based 2FA described in
`docs/auth-and-security.md`.

## Migrations

Hand-authored SQL files in `backend/prisma/migrations/`, matching Prisma's
generated style (`-- CreateEnum`, `-- CreateTable`, `-- CreateIndex`,
`-- AddForeignKey`). Apply with `npx prisma migrate deploy` in production
(applies pending migrations only, never generates new ones) or
`npm run prisma:migrate` (`prisma migrate dev`) locally when you've changed
`schema.prisma` and want a new migration generated + applied in one step.

Always run `npx prisma generate` after pulling schema changes, before
building — see `docs/deployment.md`'s "stale Prisma Client" gotcha.
