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
| `POST` | `/registrations` | 5/60s | Driver registration submission — `imageIds` must reference images uploaded via `/images` and not already attached elsewhere |
| `GET` | `/free-routes` | — | `ACTIVE` only |
| `POST` | `/admin-auth/login` | 5/60s | `{ email, password }` → `{ token }`, or `{ requiresCode: true }` if the admin has linked Telegram 2FA (see below) |
| `POST` | `/admin-auth/verify-code` | 10/60s | Second step when `requiresCode: true` — `{ email, code }` → `{ token }`, 24h TTL |
| `POST` | `/driver-auth/request-code` | 5/60s (+45s per-phone cooldown enforced in-service) | `{ phone }` → sends Telegram OTP, requires `telegramChatId` already linked |
| `POST` | `/driver-auth/verify-code` | 10/60s | `{ phone, code }` → `{ token, towTruckId, slug }`, 30-day TTL |
| `POST` | `/analytics/events` | 60/60s | Records one visitor interaction with a tow truck profile. Body `{ towTruckId, eventType, visitorId }` — `visitorId` must be a UUID v4 (browser-generated, see `frontend/utils/visitorId.ts`). Always `202` with an **empty body**, whether the event counted, was a same-day duplicate, or hit a deactivated truck (deliberately blind — see `docs/analytics.md` § Security); only an unknown `towTruckId` is a 404. The once-per-visitor-per-Armenia-calendar-day rule is enforced by a DB unique constraint, so extra requests can't inflate a number |
| `POST` | `/telegram/webhook` | — | Internal — driver bot. Telegram calls this, validated via `X-Telegram-Bot-Api-Secret-Token` header (`timingSafeEqual` against `TELEGRAM_WEBHOOK_SECRET`), not meant to be called directly |
| `POST` | `/admin-telegram/webhook` | — | Internal — separate admin 2FA/notification bot, same validation pattern against `ADMIN_TELEGRAM_WEBHOOK_SECRET`. See `docs/auth-and-security.md` |

## Driver-authenticated (`Authorization: Bearer <driver JWT>`, `DriverJwtGuard`)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/my/tow-truck` | Own profile; throws if `isActive: false` even with a valid token |
| `PATCH` | `/my/tow-truck` | Partial update covering **everything the registration form asks**, except `slug` and the main `phone` (both admin-only — see `UpdateMyTowTruckDto`). `works24Hours` auto-recomputed if `services` is included. `companyName: ""` **clears** it — the one field where empty differs from omitted. `serviceAreas` must be sent together with `citySlug`/`districtSlug` or the request is rejected. `imageIds` is the **full replacement list** — omit it to leave photos alone; sending it accepts 1-6 ids (never 0: a listing with no photo renders a broken image everywhere it appears) and its order becomes the gallery order |
| `GET` | `/my/free-routes` | Own routes, any status |
| `POST` | `/my/free-routes` | Requires `isActive` profile |
| `PATCH` | `/my/free-routes/:id` | Ownership-checked; force-reactivates to `ACTIVE` |
| `DELETE` | `/my/free-routes/:id` | Immediate hard delete, no grace period |
| `GET` | `/my/analytics` | Own overview cards + review/rating counters. `?period=LAST_7_DAYS\|LAST_30_DAYS\|LAST_90_DAYS` (default 30). No id anywhere in the URL — it comes from the JWT, so a driver can't even express a request for someone else's numbers. Re-checks `isActive` like `/my/tow-truck` |
| `GET` | `/my/analytics/charts` | Daily series for the same periods, zero-filled per day |
| `GET` | `/my/analytics/reviews` | Own reviews **including unmoderated ones**. `?status=CONFIRMED\|PENDING\|ALL&limit=` (limit capped at 100) |
| `GET` | `/my/analytics/ratings` | Star histogram 1→5 split confirmed/pending, plus both averages (`null`, not `0`, when there are none) |

## Admin-authenticated (`Authorization: Bearer <admin JWT>`, `AdminJwtGuard`)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/admin/registration-requests` | Query: `?status=PENDING\|APPROVED\|REJECTED`, `limit` (default 50, max 200), `offset` |
| `POST` | `/admin/registration-requests/:id/approve` | Body: `ApproveRegistrationDto` (see `docs/data-model.md`'s `TowTruck` section for what the admin frontend fills in vs. what carries over from the request). `regionSlug`, `platformLengthM`/`platformWidthM` and the `serviceAreas` names are all **resolved/parsed client-side** — the backend has no geography and no dimension parser. → creates `TowTruck`, returns `{ towTruckId, telegramLinkUrl }` |
| `POST` | `/admin/registration-requests/:id/reject` | |
| `GET` | `/admin/reviews` | Pending (`isApproved: false`) only. Query: `limit` (default 50, max 200), `offset` |
| `POST` | `/admin/reviews/:id/approve` | |
| `POST` | `/admin/reviews/:id/reject` | Deletes the review row outright |
| `GET` | `/admin/tow-trucks` | Every truck, active or not (unlike the public `/tow-trucks` list). Query: `limit` (default 50, max 200), `offset` |
| `PATCH` | `/admin/tow-trucks/:id/active` | Body: `{ isActive: boolean }` — reversible |
| `PATCH` | `/admin/tow-trucks/:id/featured` | Body: `{ isFeatured: boolean }` — drives the public `GET /tow-trucks/featured` list and the homepage "featured" section |
| `PATCH` | `/admin/tow-trucks/:id/phone` | Body: `{ phone: string }` (`+374` + 8 digits). Corrects the main login phone — the driver's own dashboard can't touch this field. Rejected with 400 if another **active** truck already uses it (same uniqueness rule as approval) |
| `DELETE` | `/admin/tow-trucks/:id` | Irreversible — cascades to images (DB row + Supabase Storage object), reviews, OTPs, free routes |
| `POST` | `/admin/tow-trucks/:id/telegram-link` | (Re)generates the Telegram link — same underlying call whether the truck has never linked or is switching accounts |
| `GET` | `/admin/tow-trucks/:id/analytics` | Same four reports as the driver's `/my/analytics*`, for any truck — **including deactivated ones** (an admin usually wants exactly that history). Served by the same `AnalyticsDashboardService`, so admin and driver can never see differently-computed numbers. See `docs/analytics.md` |
| `GET` | `/admin/tow-trucks/:id/analytics/charts` | |
| `GET` | `/admin/tow-trucks/:id/analytics/reviews` | |
| `GET` | `/admin/tow-trucks/:id/analytics/ratings` | |
| `GET` | `/admin/site-analytics` | Site-wide traffic, no tow truck involved: visits + Free Routes views, each as distinct people and as daily-summed visits, for `?period=` and all time. The only report in the analytics module that isn't scoped to a driver, which is why it has its own controller |

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
