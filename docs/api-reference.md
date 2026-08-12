# API reference

Base: `https://api.evakuators.am/api/v1` (prod) or `http://localhost:4002/api/v1`
(dev). Every route is under the global `/api/v1` prefix (`main.ts`).

Throttle column shows overrides from the global default (60 req/60s per IP,
`app.module.ts`). "—" means the global default applies. Requests originating
from the server itself (Nuxt SSR over loopback) skip throttling entirely — see
`docs/auth-and-security.md` § "SSR is exempt".

## Public

| Method | Path | Throttle | Notes |
| --- | --- | --- | --- |
| `GET` | `/health` | — | `{ status, database: 'up'|'down', timestamp }` — checks DB with `SELECT 1` |
| `GET` | `/tow-trucks` | — | Returns the **card shape**, not full profiles — see "List vs detail" below. Query: `city`, `district`, `region` (+`regionCities`), `yerevan`, `limit` (default & max 200), `offset` |
| `GET` | `/tow-trucks/featured` | — | Card shape. Admin-curated pick, `isFeatured: true` only — empty array if the admin hasn't marked any (homepage section then hides itself) |
| `GET` | `/tow-trucks/coverage` | — | One tiny record per active truck (`location`, `serviceAreas` slugs, `works24Hours`) — the input for every region/city/district `towTruckCount`. No contact details at all. See "List vs detail" |
| `GET` | `/tow-trucks/:slug` | — | The **only** endpoint that returns a full profile. 404 if not found or `isActive: false` |
| `GET` | `/tow-trucks/:towTruckId/reviews` | — | Approved reviews only |
| `POST` | `/tow-trucks/:towTruckId/reviews` | 5/60s | Creates with `isApproved: false` — needs admin approval to appear |
| `POST` | `/images` | 10/60s | Multipart, field name `file`, 30MB max (`MAX_UPLOAD_BYTES`, kept in sync by hand with the same-named constant in `image-processor.service.ts`) → returns `{ id, url, width, height }`, unattached until a registration references its id. Format is validated from the file's own bytes (`sharp().metadata().format`), not the client-declared mimetype: JPEG/PNG/WebP always, HEIC only if this sharp build has libheif — otherwise it returns a message telling the driver how to change the iPhone setting |
| `POST` | `/analytics/site-events` | 60/60s | Body `{ eventType: SITE_VISIT\|FREE_ROUTES_VIEW, visitorId }`. `202` + empty body, deduplicated to once per visitor per Armenia day — see `docs/analytics.md` § "Site-wide traffic" |
| `POST` | `/nearest-tow-trucks` | 10/60s + 40/day per IP | Body `{ latitude, longitude }` — the visitor's own position. Returns `{ results, routed }`, at most 10 drivers, each an ordinary **card shape** plus `straightLineMeters` and (when routing succeeded) `roadMeters`/`durationSeconds`. A **POST** despite being a read: a query string would put the visitor's exact coordinates in nginx's `access.log` next to their IP. The position is never stored. The daily ceiling is charged only when a search actually runs (a 5-minute cache hit is free, and is still served to an address over the ceiling); exceeding it answers `429` with `code: "NEAREST_DAILY_LIMIT"` — a code rather than a message, because the frontend shows different copy for this than for the per-minute throttle. **This ceiling is not the visitor-facing "2 searches per day"**, which is per browser; an IP is not a person (CGNAT) — see `docs/nearest-search.md` § "How often one person may search" |
| `POST` | `/registrations` | 5/60s | Driver registration submission — `imageIds` must reference images uploaded via `/images` and not already attached elsewhere. `latitude`/`longitude` are **optional** (the form's hardest step, and editable from the dashboard once approved — see `docs/data-model.md`), but must be sent **both or neither**: one alone is a 400 |
| `GET` | `/free-routes` | — | `ACTIVE` only |
| `POST` | `/admin-auth/login` | 5/60s | `{ email, password }` → `{ token }`, or `{ requiresCode: true }` if the admin has linked Telegram 2FA (see below) |
| `POST` | `/admin-auth/verify-code` | 10/60s | Second step when `requiresCode: true` — `{ email, code }` → `{ token }`, 24h TTL |
| `POST` | `/driver-auth/login` | 10/60s | `{ phone, password }` → `{ token, towTruckId, slug, mustChangePassword }`, 30-day TTL. Unknown phone, no password set, and wrong password all return the **same** 401 message — the phone is public, so distinguishing them would report which numbers are accounts. No per-account lockout, for the same reason. `mustChangePassword` is true while the password is still the generated one; the dashboard blocks on it |
| `POST` | `/analytics/events` | 60/60s | Records one visitor interaction with a tow truck profile. Body `{ towTruckId, eventType, visitorId }` — `visitorId` must be a UUID v4 (browser-generated, see `frontend/utils/visitorId.ts`). Always `202` with an **empty body**, whether the event counted, was a same-day duplicate, or hit a deactivated truck (deliberately blind — see `docs/analytics.md` § Security); only an unknown `towTruckId` is a 404. The once-per-visitor-per-Armenia-calendar-day rule is enforced by a DB unique constraint, so extra requests can't inflate a number |
| `POST` | `/telegram/webhook` | — | Internal — driver bot. Telegram calls this, validated via `X-Telegram-Bot-Api-Secret-Token` header (`timingSafeEqual` against `TELEGRAM_WEBHOOK_SECRET`), not meant to be called directly |
| `POST` | `/admin-telegram/webhook` | — | Internal — separate admin 2FA/notification bot, same validation pattern against `ADMIN_TELEGRAM_WEBHOOK_SECRET`. See `docs/auth-and-security.md` |

## Driver-authenticated (`Authorization: Bearer <driver JWT>`, `DriverJwtGuard`)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/my/tow-truck` | Own profile; throws if `isActive: false` even with a valid token |
| `PATCH` | `/my/tow-truck` | Partial update covering **everything the registration form asks**, except `slug` and the main `phone` (both admin-only — see `UpdateMyTowTruckDto`). `works24Hours` auto-recomputed if `services` is included. `companyName: ""` **clears** it — the one field where empty differs from omitted. `serviceAreas` must be sent together with `citySlug`/`districtSlug` or the request is rejected. `imageIds` is the **full replacement list** — omit it to leave photos alone; sending it accepts 1-6 ids (never 0: a listing with no photo renders a broken image everywhere it appears) and its order becomes the gallery order |
| `PATCH` | `/my/tow-truck/password` | Body `{ currentPassword, newPassword }` (min 8, max 72 — bcrypt truncates past that). 10/60s, stricter than the global default because the request itself is a guess at `currentPassword`. Answers **204** with no body, and a wrong current password answers **400, not 401**: `apiFetch` logs the driver out on any 401 from a `/my/*` path, so a 401 here would eject them for a typo. Clears `mustChangePassword`. Does not invalidate any session, including the caller's |
| `PATCH` | `/my/tow-truck/coordinates` | Body `{ latitude, longitude }`, both required numbers — the driver's own base parking point. Its own route rather than two more keys on the PATCH above, because the dashboard edits it in a dialog with its own Save: a two-field DTO cannot touch another column even in principle, and the dialog never resubmits half-finished profile-form state. No id in the path (it comes from the JWT), so a driver cannot express a request to move someone else's marker. Returns the full refreshed profile |
| `GET` | `/my/free-routes` | Own routes, any status |
| `POST` | `/my/free-routes` | Requires `isActive` profile |
| `PATCH` | `/my/free-routes/:id` | Ownership-checked; force-reactivates to `ACTIVE` |
| `DELETE` | `/my/free-routes/:id` | Immediate hard delete, no grace period |
| `GET` | `/my/analytics` | Own overview cards + review/rating counters. `?period=LAST_7_DAYS\|LAST_30_DAYS\|LAST_90_DAYS` (default 30). No id anywhere in the URL — it comes from the JWT, so a driver can't even express a request for someone else's numbers. Re-checks `isActive` like `/my/tow-truck` |
| `GET` | `/my/analytics/charts` | Daily series for the same periods, zero-filled per day |
| `GET` | `/my/analytics/reviews` | Own reviews **including unmoderated ones**. `?status=CONFIRMED\|PENDING\|ALL&limit=` (limit capped at 100) |
| `GET` | `/my/analytics/ratings` | Star histogram 1→5 split confirmed/pending, plus both averages (`null`, not `0`, when there are none) |

### `?vehicleType=` on `GET /tow-trucks`

Powers `/manipulator` and `/tsanr-tehnika`. A parameter rather than a route of
its own, exactly like `city`/`district`/`region`/`zone` — this is the card
list, narrowed, and a second endpoint would be a second place for the card
shape, the rating join and the row cap to drift.

- **Narrows, never widens.** It is ANDed with whatever geography is asked for.
  Pushing it into the geography `OR` would turn `?region=kotayk&vehicleType=…`
  into "everything in Kotayk or every truck of that type in the country".
- **`manipulator` is a union**, not an equality: `vehicleType = 'manipulator'`
  OR `manipulator = true`. The question is asked twice at registration and
  either answer counts (`docs/taxonomies.md`). Writes derive the column now, so
  new rows agree; rows written before that do not.
- **Not validated against a member list**, on purpose: the vehicle-type
  taxonomy lives in the frontend and the backend stores the column as an opaque
  string. An unknown slug matches nothing, which is the honest answer.

`backend/test/vehicle-type-filter.spec.ts` covers all three.

## Admin-authenticated (`Authorization: Bearer <admin JWT>`, `AdminJwtGuard`)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/admin/registration-requests` | Query: `?status=PENDING\|APPROVED\|REJECTED`, `limit` (default 50, max 200), `offset`. Almost the raw Prisma row — the one mapped field is the coordinate pair: `latitude`/`longitude` are `Decimal`, which serialises to a **string** through decimal.js's own `toJSON()`, so they are converted to `number \| undefined` before they reach the wire (`admin-registration.mapper.ts`) |
| `POST` | `/admin/registration-requests/:id/approve` | Body: `ApproveRegistrationDto` (see `docs/data-model.md`'s `TowTruck` section for what the admin frontend fills in vs. what carries over from the request). `regionSlug`, `platformLengthM`/`platformWidthM` and the `serviceAreas` names are all **resolved/parsed client-side** — the backend has no geography and no dimension parser. The **base** (`citySlug`/`districtSlug` + composed `locationName`) is now chosen by the moderator from that driver's own served areas, not inferred from the first one — see `docs/locations.md` § "The base". `latitude`/`longitude` are optional and mean "the moderator changed the pair": omitting both keeps whatever the driver submitted, which is the normal case; sending one of the two is a 400. → creates `TowTruck`, returns `{ towTruckId, telegramLinkUrl }` |
| `POST` | `/admin/registration-requests/:id/reject` | |
| `GET` | `/admin/reviews` | Pending (`isApproved: false`) only. Query: `limit` (default 50, max 200), `offset` |
| `POST` | `/admin/reviews/:id/approve` | |
| `POST` | `/admin/reviews/:id/reject` | Deletes the review row outright |
| `GET` | `/admin/tow-trucks` | Every truck, active or not (unlike the public `/tow-trucks` list). Query: `limit` (default 50, max 200), `offset` |
| `GET` | `/admin/tow-trucks/count` | `{ total, active, inactive }` — totals across the **whole table**, independent of the pagination above. `inactive` is `total - active`, never a third `count()`, so the three numbers can't disagree with each other. Declared before every `tow-trucks/:id` route in `admin.controller.ts` so the literal segment `count` can never be swallowed by an `:id` param — see `backend/test/admin.controller.count-route.spec.ts`, which asserts that ordering as a general rule, not just for today's route list. Powers the total shown next to "Էվակուատորներ" in the admin panel (`pages/admin.vue`) |
| `PATCH` | `/admin/tow-trucks/:id/active` | Body: `{ isActive: boolean }` — reversible |
| `PATCH` | `/admin/tow-trucks/:id/featured` | Body: `{ isFeatured: boolean }` — drives the public `GET /tow-trucks/featured` list and the homepage "featured" section |
| `PATCH` | `/admin/tow-trucks/:id/phone` | Body: `{ phone: string }` (`+374` + 8 digits). Corrects the main login phone — the driver's own dashboard can't touch this field. Rejected with 400 if another **active** truck already uses it (same uniqueness rule as approval) |
| `PATCH` | `/admin/tow-trucks/:id/coordinates` | Body `{ latitude, longitude }` — same `SetCoordinatesDto`, same rule and same messages as the driver's route above, deliberately shared so the two audiences can never validate one value differently. Unlike `/phone` this is **not** an admin-only field: it exists so support can fix a pair pasted in the wrong order without asking the driver to log in. Works on deactivated trucks too |
| `PATCH` | `/admin/tow-trucks/:id/primary-area` | Body `{ citySlug? \| districtSlug?, regionSlug?, locationName }` — the truck's **base**, i.e. the one place it works out of, as opposed to the list of places it covers. Exactly one of city/district, and it must be one of the truck's own served areas: `assertPlacementIsServed` also rejects a road corridor and a district sent as a city. `regionSlug` is nulled for a Yerevan district (pseudo-region). `locationName` is the composed label («Վարդենիս, գյուղ Շատվան») — the backend has no geography and stores it verbatim. Not cosmetic: city listings rank locally-based drivers first. See `docs/locations.md` § "The base" |
| `PATCH` | `/admin/tow-trucks/:id/service-areas` | Body `{ slug, citySlug?, districtSlug?, regionSlug? }` — removes **one** served area. Takes the slug to drop, never the resulting list, so it can only shrink coverage; that is why it is the one `serviceAreas` write path with no coverage-cap check (applying it would make legacy over-limit drivers the only ones an admin could not trim). Refuses the last remaining area — an empty list matches no filter, so use `/active` to hide a driver. The placement fields are read **only** when the removed area is the truck's own `citySlug`/`districtSlug`, and are rejected if they name something outside the remaining areas; otherwise they are ignored, so a removal can never double as a relocation. Returns the coverage read back from the row. See `docs/locations.md` § "An admin can remove a single area" |
| `DELETE` | `/admin/tow-trucks/:id` | Irreversible — cascades to images (DB row + Supabase Storage object), reviews, free routes, and both analytics tables |
| `POST` | `/admin/tow-trucks/:id/telegram-link` | (Re)generates the Telegram link — same underlying call whether the truck has never linked or is switching accounts. Tapping it also mints and sends a password if the driver has none of their own yet |
| `POST` | `/admin/tow-trucks/:id/reset-password` | Revokes the driver's password and arms a fresh link in **one** write — `{ telegramLinkUrl, hadPassword }`. Sends nothing itself; the new temporary password is minted when the driver taps, by the same `handleStart` path as onboarding, so there is no second password-minting code path. The old password stops working immediately, which is deliberate (the button also answers a leaked password, not just a forgotten one) and is why the panel's confirm names the lockout. Never messages an already-linked chat even though it could — a driver who lost their Telegram is exactly who needs this. `telegramChatId` is untouched. See `docs/auth-and-security.md` § "The admin reset" |
| `GET` | `/admin/tow-trucks/password-candidates` | Read-only — the drivers who could be handed a password now (Telegram linked, no password yet). The panel lists these with checkboxes so recipients are chosen before anything is sent |
| `POST` | `/admin/tow-trucks/issue-passwords` | Sends a temporary password over Telegram to **exactly** the drivers named in `{ towTruckIds: number[] }` — required and non-empty, there is no "send to everyone" shorthand, because a Telegram message cannot be unsent and staging's database holds real drivers' real chat ids. Ids are intersected with the live candidate list, so one that is no longer eligible is counted in `skipped` rather than acted on (which also stops this being a way to reset an arbitrary driver's password by id). `{ issued, failed: [{ id, slug }], skipped }` |
| `GET` | `/admin/tow-trucks/broadcast-candidates` | Read-only — active, Telegram-linked drivers the admin broadcast can currently reach. Same shape as `password-candidates`, different eligibility question |
| `POST` | `/admin/tow-trucks/broadcast-message` | Body `{ message: string, towTruckIds: number[] }` — sends `message` verbatim, no button, to **exactly** the drivers named; same "no send-to-everyone shorthand" rule and reasoning as `issue-passwords`. `message` capped at `TELEGRAM_MESSAGE_MAX_LENGTH` (4000, both sides — see CLAUDE.md § "Manual sync points"), comfortably under Telegram's own 4096-character `sendMessage` limit. `towTruckIds` intersected with the live active+linked candidate list. `{ sent, failed: [{ id, slug }], skipped }`. See `docs/auth-and-security.md` § "The admin broadcast" |
| `GET` | `/admin/tow-trucks/:id/analytics` | Same four reports as the driver's `/my/analytics*`, for any truck — **including deactivated ones** (an admin usually wants exactly that history). Served by the same `AnalyticsDashboardService`, so admin and driver can never see differently-computed numbers. See `docs/analytics.md` |
| `GET` | `/admin/tow-trucks/:id/analytics/charts` | |
| `GET` | `/admin/tow-trucks/:id/analytics/reviews` | |
| `GET` | `/admin/tow-trucks/:id/analytics/ratings` | |
| `GET` | `/admin/site-analytics` | Site-wide traffic, no tow truck involved: visits + Free Routes views, each as distinct people and as daily-summed visits, for `?period=` and all time. Also `callers` — distinct people who pressed "Զանգահարել" on ANY truck's profile in the period, plus daily-summed and all-time call totals; read platform-wide from the per-truck analytics tables with no `towTruckId` filter, not from the site-visit tables above. The only report in the analytics module that isn't scoped to a driver, which is why it has its own controller. See `docs/analytics.md` § "Platform-wide active callers" |

## List vs detail — two different shapes on purpose

`GET /tow-trucks` used to return the **full profile** of every truck, which meant
one unauthenticated request handed out every driver's secondary phone, WhatsApp,
Telegram and email — the platform's entire contact database — plus descriptions,
price tables, plate numbers and every photo URL that no card renders.

There are now three shapes, and which one you get depends on the endpoint:

| Shape | Endpoints | Contains | Size |
| --- | --- | --- | --- |
| **Coverage** | `/tow-trucks/coverage` | base location, service-area slugs, `works24Hours` | ~230 B/truck, **no personal data** |
| **Card** | `/tow-trucks`, `/tow-trucks/featured` | what a listing card renders: main phone + WhatsApp, vehicle summary, services, service areas, one thumbnail | ~1.1 KB/truck |
| **Full** | `/tow-trucks/:slug`, `/my/tow-truck` | everything | ~2.0 KB/truck |

Measured on a representative fixture: the card is 54% of the old list row and
the coverage record 11%. `whatsapp` is in the card because the card has a
WhatsApp button; `telegram` and `email` are not, because it doesn't.

The narrowing is a Prisma `select`, not a post-mapping step — the omitted
columns are never read off disk, and a list query loads one image row per truck
instead of all of them.

**`plateNumber` is withheld whenever `showPlateNumber` is false**, at the mapper.
It used to be sent regardless and merely hidden by the UI, so a driver who opted
out had it published anyway, one "view source" away.

**`location.latitude` / `location.longitude` are withheld from every public
response**, at the same mapper and for the same reason. `toTowTruckApi` takes an
`includeCoordinates` option that defaults to **false**, so the public profile
gets nothing and only `GET /my/tow-truck` (the driver's own) opts in; the card
and coverage shapes have no such field at all, and the admin list carries them
only because it is behind `AdminJwtGuard`. The default is `false` rather than
`true` so a caller added later leaks nothing until someone writes the flag and
has to justify it. When a distance feature eventually needs these, what it needs
is a *distance* — a number the backend can return without handing out the point
it was computed from.

## Pagination

- **Public listing** — `limit` defaults to 200 and is capped at 200, with an
  optional `offset`. There is no pagination envelope: responses stay bare arrays
  and the frontend filters them client-side, which is correct as long as one
  geography's trucks fit in one response (an Armenian city has dozens, not
  thousands). `TowTrucksService.list()` logs a warning when a response actually
  hits the cap — that is the tripwire saying filtering and pagination now have to
  move server-side, because client-side filtering would otherwise silently hide
  matches on later pages.
- **Sitemap** — the one consumer that must see every truck, so
  `server/routes/sitemap.xml.ts` walks pages with `limit`/`offset` rather than
  being truncated at 200.
- **Admin listings** — real `limit`/`offset` pagination with a "load more"
  button. These are the tables that grow without bound (registration requests are
  kept forever as an audit trail) and nothing about them is filtered
  client-side, so offset paging is both necessary and safe here.
- **Totals for a paginated admin list** — a separate `.../count` endpoint
  (see `/admin/tow-trucks/count` above), not a `total` field bolted onto the
  paginated response. The list is refetched a page at a time and would
  otherwise recompute a total on every "load more"; the count is one cheap
  query that only needs to run once per page load and after an action that
  actually changes it. If another admin list grows a "how many exist"
  requirement, follow this shape rather than inventing a pagination envelope.

## Response shape conventions

- List endpoints return bare arrays, not `{ data: [...] }` wrappers.
- Mutation endpoints that "create" something return the created/updated
  resource's shape (or a minimal `{ id, ...changedFields }` for
  status-flip-style actions) — check the specific controller method's return
  type rather than assuming a blanket convention.
- Validation errors (`class-validator` failures) come back as NestJS's
  default 400 shape (`{ statusCode, message: string[], error }`) — the
  frontend's `apiFetch()` wrapper doesn't do anything special with this, it's
  handled ad hoc at each call site via `FetchError` (see `frontend/pages/
  login.vue`'s `extractErrorMessage()` for a typical pattern).
