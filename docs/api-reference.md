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
| `POST` | `/nearest-tow-trucks` | 10/60s per IP | Body `{ latitude, longitude, skipRouting? }` — the visitor's own position. Returns `{ results, routed }`, at most 10 drivers, each an ordinary **card shape** plus `straightLineMeters` and (when routing succeeded) `roadMeters`/`durationSeconds`. A **POST** despite being a read: a query string would put the visitor's exact coordinates in nginx's `access.log` next to their IP. The position is never stored. `skipRouting: true` asks for straight-line distances only — sent by the frontend once a visitor has spent their 2 detailed searches for the day, after which the search keeps working, unlimited and free. It is the one client-set flag the backend trusts uncorroborated, because it can only ask for **less**; the inverse ("route this one anyway") must never be added. A separate **global** daily budget (500 ORS calls/day, minus a safety margin — `NEAREST_ORS_DAILY_QUOTA`) is charged only when a search actually calls the route matrix (a 5-minute cache hit is free); once it is spent for the day, the search silently falls back to `routed: false` straight-line distances instead of erroring — there is no 429 for this, and it is never per-IP. **Unrelated to the visitor-facing "2 searches per day"**, which is per browser — see `docs/nearest-search.md` § "How often one person may search" |
| `POST` | `/registrations` | 5/60s | Driver registration submission — `imageIds` must reference images uploaded via `/images` and not already attached elsewhere. `latitude`/`longitude` are **optional** (the form's hardest step, and editable from the dashboard once approved — see `docs/data-model.md`), but must be sent **both or neither**: one alone is a 400. Also requires `privacyConsentAccepted: true` and a `privacyPolicyVersion` matching the server's current one — the version is checked *first*, before any other validation, so a tab left open across a policy change is told to reload rather than burning its 5/60s budget. The request and its consent record are written in **one transaction**: a stored registration with no consent is impossible. See `docs/auth-and-security.md` § "Privacy consent" |
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
| `PATCH` | `/my/tow-truck` | Body: `UpdateMyTowTruckDto`. **Does not write.** Queues a diff for moderation and answers with the queue status (`DriverProfileChangeStatusApi`), not a profile — see § "Driver edits are moderated". `pending: null` means nothing differed, which is normal: the dashboard submits every field whether or not it was touched |
| `PATCH` | `/my/tow-truck/password` | Body `{ currentPassword, newPassword }` (min 8, max 72 — bcrypt truncates past that). 10/60s, stricter than the global default because the request itself is a guess at `currentPassword`. Answers **204** with no body, and a wrong current password answers **400, not 401**: `apiFetch` logs the driver out on any 401 from a `/my/*` path, so a 401 here would eject them for a typo. Clears `mustChangePassword`. Does not invalidate any session, including the caller's |
| `PATCH` | `/my/tow-truck/coordinates` | Body: `SetCoordinatesDto`. Also queues — a base location is as public a claim as a service area, and leaving it self-service would make it the way around the review. Same response shape |
| `GET` | `/my/tow-truck/profile-change` | What is queued for this driver, or why the last attempt was refused. Never both |
| `DELETE` | `/my/tow-truck/profile-change` | Withdraws the queued edit. Nothing was applied, so it is deleted rather than marked cancelled |
| `GET` | `/my/tow-truck/privacy-consent` | `{ requiresPrivacyConsent, policyVersion, acceptedAt }`. The **authoritative** answer — `DriverSession.requiresPrivacyConsent` from login is a cached copy that goes stale across a version bump or a consent given in another tab, so the dashboard re-reads this on load |
| `POST` | `/my/tow-truck/privacy-consent` | Body `{ policyVersion, accepted: true }`. **Idempotent**: a second call returns the *first* acceptance's `acceptedAt` rather than writing a second row, so a double-tapped button is one consent. A `policyVersion` other than the server's current one is **400** ("reload the page"), never a silent upgrade. `accepted: false` is rejected by `@Equals(true)`. There is deliberately **no `consentTextHash` field** — the server hashes its own canonical text; see `docs/auth-and-security.md` § "Privacy consent". 10/60s. Answers 200 with the new status, not 204, because the response is what clears the frontend's block |
| `DELETE` | `/my/tow-truck/privacy-consent` | Withdraws it. Rows are marked `revokedAt`, **never deleted** — the record of the period during which publication was consented to is the point. Idempotent (`{ revoked: 0 }` when there was nothing live). The driver's next dashboard load blocks again. 10/60s |
| `GET` | `/my/tow-truck/privacy-consent/history` | The caller's own consent history, projected: `policyVersion`, `acceptedAt`, `revokedAt`, `source`. `ipHash`, `userAgent` and `consentTextHash` are withheld — they answer a regulator's question, not a driver's |
| `GET` | `/my/free-routes` | Own routes, any status |
| `POST` | `/my/free-routes` | Requires `isActive` profile |
| `PATCH` | `/my/free-routes/:id` | Ownership-checked; force-reactivates to `ACTIVE` |
| `DELETE` | `/my/free-routes/:id` | Immediate hard delete, no grace period |
| `GET` | `/my/analytics` | Own overview cards + review/rating counters. `?period=LAST_7_DAYS\|LAST_30_DAYS\|LAST_90_DAYS` (default 30). No id anywhere in the URL — it comes from the JWT, so a driver can't even express a request for someone else's numbers. Re-checks `isActive` like `/my/tow-truck` |
| `GET` | `/my/analytics/charts` | Daily series for the same periods, zero-filled per day |
| `GET` | `/my/analytics/reviews` | Own reviews **including unmoderated ones**. `?status=CONFIRMED\|PENDING\|ALL&limit=` (limit capped at 100) |
| `GET` | `/my/analytics/ratings` | Star histogram 1→5 split confirmed/pending, plus both averages (`null`, not `0`, when there are none) |
| `GET` | `/my/subscription-plans` | `{ items: SubscriptionPlanApi[] }` — the two plans on sale, straight from the constants in `backend/src/subscriptions/subscription-plans.ts` (no table, see § "Subscription payments"). `id` **is** the plan's code (`ONE_MONTH` / `FOUR_MONTHS`) |
| `GET` | `/my/subscription-payments/status` | `{ status, paidUntil?, daysLeft, locked, paymentsEnabled, isActive, deactivationReason? }` — what the dashboard decides its gate from. `paymentsEnabled: false` (no Idram credentials) hides the whole driver-facing side and forces `locked: false` Read on every load, never cached in the session: a session lasts 30 days and a subscription does not |
| `GET` | `/my/subscription-payments` | Own payment requests, newest first, capped at 50 |
| `POST` | `/my/subscription-payments` | Body is `{ planId }` and **nothing else** — see § "Subscription payments". 10/60s. Answers the created record: amount, currency, months, `periodStart`/`periodEnd`, `status`, and the `towTruckId` the server derived |

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
- **Naming one of these two types is the only way to see them at all.**
  `manipulator` and `heavy-duty` are landing-page-only: omit `vehicleType` and
  `GET /tow-trucks` excludes them, because a request with no type is general
  discovery. This is why the exclusion is the last branch of `buildWhere` and
  not a line at the top — see `docs/taxonomies.md` § "Landing-page-only vehicle
  types".

`backend/test/vehicle-type-filter.spec.ts` covers all four.

### General discovery hides two vehicle types

Applies to `GET /tow-trucks` with no `vehicleType`, `GET
/tow-trucks/coverage`, `GET /tow-trucks/featured` and `POST /nearest`: none of
them return «Մանիպուլյատոր» or «Ծանր տեխնիկա» trucks. `GET /tow-trucks/:slug`
does — a specialist profile is a real page, linked from its landing page — and
so does every `/admin` endpoint.

The rule is the stored `vehicleType` alone, never `manipulator` /
`heavyEquipment`: a flatbed that also carries a crane is an ordinary evacuator
and stays in the town listings. Full reasoning, and the list of the five places
it is applied, in `docs/taxonomies.md`.

A consumer that genuinely needs every published truck — the sitemap is the only
one — asks for each listing in turn (the general one plus one per landing page)
and dedupes, rather than being handed a flag that turns the rule off.

### Subscription payments

A driver buys platform access from their own dashboard («Վճարումներ»). Two
things about this endpoint are deliberate and load-bearing.

**The request body is one plan code.** Not the price, not the number of
months, not the driver id, not the status:

```
POST /api/v1/my/subscription-payments
Authorization: Bearer <driver JWT>

{ "planId": "FOUR_MONTHS" }
```

The price and duration come from `subscription-plans.ts`, the driver from
`request.towTruckId` (the JWT — a driver cannot express a request to pay on
someone else's behalf), and the status from the column default. Sending any of
them anyway is a **400, not a silent strip**: the global `ValidationPipe` runs
with `forbidNonWhitelisted`, so a frontend that starts sending `amount` finds
out immediately instead of appearing to work while the server ignores it.

**The plans are constants, not rows.** Two plans that change roughly never are
static data, and this project keeps static data in typed constants (CLAUDE.md
§ "Core architectural decision"). What has to be server-side is the *price*,
and it is — the file is backend-only. `SubscriptionPayment.planCode` stores
which plan was bought, with no foreign key to point at.

**Nothing is charged automatically yet.** There is no payment provider wired
up, so a driver's own request lands as `PENDING` and grants nothing until a
person confirms the money arrived — see § "Confirming a payment" below.
`amount`, `currency` and `durationMonths` are copied onto each row at purchase
time rather than read back from the plan list, so a later price change cannot
rewrite what a driver was quoted.

### Confirming a payment

`SubscriptionPayment` is the **only** thing `/admin/payments` computes a
driver's status from. `TowTruck.lastPaymentAt` — the old single-timestamp
bookkeeping — is legacy, read and written by nothing; migration
`20260902140000_backfill_subscription_payments` copied every value it held
into a PAID row so no driver's status changed on the deploy.

That replacement was forced by the 4-month plan. The old rule counted days
since `lastPaymentAt` (25 → due soon, 30 → overdue), which encoded a monthly
cadence into the status itself: a driver who had paid for four months read as
**overdue on day 31**. Status now comes from `paidUntil` — the furthest
`periodEnd` among that driver's PAID payments — so plan length stops mattering
(`subscriptions/subscription-status.ts`).

Two ways a payment becomes PAID, and a third coming:

| | Who | What it writes |
| --- | --- | --- |
| Driver requests | `POST /my/subscription-payments` | a PENDING row — grants nothing |
| Admin confirms | `PATCH /admin/subscription-payments/:id` `{ status: 'PAID' }` | flips it to PAID and **recomputes** the period |
| Admin records an offline payment | `POST /admin/subscription-payments` `{ towTruckId, planId, paidAt? }` | a PAID row directly |
| *(later)* the provider | its webhook | the same PAID row — nothing else changes |

Confirmation recomputes the window rather than honouring the one stored at
request time, because that one was a quote: days may have passed, and honouring
it would sell less than the plan says. It also **extends** live coverage
instead of restarting it (`renewalPeriod`), so renewing a week early is not a
week lost.

An admin picks a **plan**, never an amount — the price and duration come from
the same constants the driver was quoted from, so the two ways money gets
recorded cannot disagree about what a month costs.

### Being taken off the site

`PATCH /admin/tow-trucks/:id/active` requires a **reason** when deactivating
(`UNPAID` or `OTHER` — `DeactivationReason`), and it is not bookkeeping: it
decides whether that driver can sign in again at all.

| Reason | Login | What the driver sees |
| --- | --- | --- |
| `UNPAID` | allowed | Dashboard replaced by the payment block, with a dialog saying the page is off the site and to pay |
| `OTHER`, or none recorded | **refused, 403** | The login page shows the contact number and asks them to call |

The split exists because one of these is a bill the driver can settle alone and
the other is a decision only a person can undo. Refusing an `UNPAID` driver
would put the payment block — the only way out — behind the very login being
refused; issuing a session to an `OTHER` one would hand a banned driver a
working token back.

A deactivation recorded before this column existed reads as "no reason", and
login treats that as `OTHER`. Refusing is the safe direction: after the fact we
cannot tell a ban from an unpaid bill.

`login` answers **401** for every credential failure and **403** only here, and
the deactivation check deliberately runs AFTER the password comparison — so the
403 can never become an oracle for "this number exists and is banned". The
login page tells the two apart by that status code alone, which is why the
contact number lives in `frontend/constants/site.ts` (`CONTACT_PHONE`) and not
in the API's message.

Nothing else changed: `GET /my/tow-truck` still refuses a deactivated driver
outright, and every write path already went through that same check. The
dashboard learns *why* it cannot load a profile from
`GET /my/subscription-payments/status`, which carries `isActive` and the reason.

### When a subscription lapses

An `overdue` driver's dashboard is replaced by the payment block alone, and
`SubscriptionActiveGuard` refuses the same driver's **writes** at the API with
**402 Payment Required** — the profile edit, the coordinates edit, and posting,
editing or deleting a free route. Reads, the password change, the privacy
consent and every subscription route stay open: a paywall that also blocks
paying is a wall.

402 and not 401 on purpose. `apiFetch` treats a 401 on a `/my/*` path as an
expired session and signs the driver out (`repositories/apiClient.ts`), which
would eject someone whose session is fine and whose actual problem is a bill.

**`unpaid` is never locked — only `overdue`.** Both fail to clear a driver, but
one has never been billed at all: every driver an admin never marked paid, and
everyone who signed up before any of this existed. Locking that group would
take the platform's drivers offline on the deploy that ships it, for money
nobody ever asked them for. The rule is "you had it and it ran out"
(`isLockedOut`).

Five days out — the same threshold `due-soon` already uses — the dashboard
shows a dismissible dialog naming the date. It reappears on every visit while
that window is open: it is the last thing standing between a driver and a
locked dashboard.

Nothing here touches the public site. An overdue driver's profile and free
routes stay listed; taking a driver off the site is still an admin's explicit
decision (`isActive`), exactly as it was.

**The whole paywall is off until the gateway is configured.** With
`IDRAM_REC_ACCOUNT`/`IDRAM_SECRET_KEY` blank, `getMyStatus` answers
`paymentsEnabled: false` and `locked: false`, `SubscriptionActiveGuard` refuses
nothing, and the dashboard renders no payment block and no reminder — while the
callback endpoint and `/admin/payments` stay fully live. This is what lets the
three URLs be registered with Idram before their credentials exist: the
backfill migration makes most of the existing fleet read as `overdue`, and
locking them out over a bill they have no way to settle is the one failure this
feature could not survive. Setting both variables switches it on with a
restart, not a redeploy — see `docs/deployment.md` § "Turning Idram payments
on".

### Paying through Idram

Three URLs are registered with Idram, and which host each one lives on is the
whole design:

| | Who goes there | Host |
| --- | --- | --- |
| SUCCESS_URL `/payment/idram/success` | the driver's **browser** | `evakuators.am` |
| FAIL_URL `/payment/idram/failed` | the driver's **browser** | `evakuators.am` |
| RESULT_URL `POST /api/v1/idram/result` | **Idram's server** | `api.evakuators.am` |

The confirmation has to land where the database is, which is why RESULT_URL is
on the API and not the site. The two browser pages prove nothing — anyone can
open them — so the success page reads the real status back from
`GET /my/subscription-payments/status` and tolerates arriving before the
callback does.

**The flow.** `POST /my/subscription-payments` creates the PENDING row *and*
returns `gateway` — where to POST and what to POST. The browser submits that
form, Idram asks us to confirm the order (`EDP_PRECHECK=YES`), the driver pays,
and Idram posts the confirmation. Both callbacks hit the same URL and are told
apart by `EDP_PRECHECK`.

**The row exists before the handoff, and that ordering is required**: the
preliminary callback asks whether this bill is a real order, and there would be
nothing to answer with otherwise.

**The amount check is the security boundary.** The payment form is in the
driver's own browser, so nothing stops them editing `EDP_AMOUNT` to 1 before
submitting. Idram then asks us, before charging, whether that is really the
order — and refusing there is the entire reason a driver cannot buy four months
for one dram (`idramAmountMatches`).

**The reply body is what Idram reads**, not the status code: `OK` and nothing
else means accepted. So the endpoint always answers 200 in plain text and never
throws — a JSON error page from `AllExceptionsFilter` would be a perfectly good
refusal and a much worse thing to read in a provider's logs. Refusals are loud
in our logs instead.

Refusing has consequences by design: on the preliminary request it stops the
charge, and on the confirmation it makes Idram email the merchant address
rather than consider us notified.

Other things worth knowing:

- The confirmation's `EDP_CHECKSUM` is MD5 over seven fields joined by `:` with
  the **secret third, in the middle** — computed from the raw strings Idram
  sent, never from our own re-formatted values (`idram-checksum.ts`).
- The preliminary request carries **no checksum**, so it cannot be
  authenticated at all. Answering it is therefore strictly read-only.
- `EDP_TRANS_ID` is stored and unique. A gateway retries anything it did not
  hear `OK` from, so the same transaction arrives more than once by design — a
  replay answers `OK` and confirms nothing twice.
- `EDP_REC_ACCOUNT` is checked against ours, which is what keeps a test-account
  callback out of the production database.
- The body is read as a raw record, not a DTO: the global `forbidNonWhitelisted`
  pipe would answer 400 the day Idram adds a field, and payments would stop.
- With `IDRAM_REC_ACCOUNT`/`IDRAM_SECRET_KEY` unset, every callback is refused
  and no `gateway` is offered — a working deploy that cannot take card payments
  yet, the same convention `ROUTE_MATRIX_API_KEY` uses.

## Admin-authenticated (`Authorization: Bearer <admin JWT>`, `AdminJwtGuard`)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/admin/registration-requests/:id` | One request, by id — what the review page at `/admin/registrations/:id` loads. Same shape as one element of the list below (one mapper, so the page and the card cannot disagree about a field). Not served from the list endpoint, which is paginated and status-filtered: a request reached by URL, by bookmark or after a reload may be in no page of it |
| `GET` | `/admin/registration-requests` | Query: `?status=PENDING\|APPROVED\|REJECTED`, `limit` (default 50, max 200), `offset`. Almost the raw Prisma row — the one mapped field is the coordinate pair: `latitude`/`longitude` are `Decimal`, which serialises to a **string** through decimal.js's own `toJSON()`, so they are converted to `number \| undefined` before they reach the wire (`admin-registration.mapper.ts`) |
| `POST` | `/admin/registration-requests/:id/approve` | Body: `ApproveRegistrationDto` — **the whole profile**, as the moderator last saw it. It extends the same `RegistrationProfileDto` the public form posts, and adds what only the platform can supply: `slug`, `capacityTons`, the base (`citySlug`/`districtSlug` + composed `locationName` + `regionSlug`), `description` and `serviceAreas`. `capacityTons`, `regionSlug` and the `serviceAreas` names are **resolved client-side** — the backend has no taxonomy and no geography. `latitude`/`longitude` are the box exactly as the moderator left it: omitting both means *no location*, not "keep the driver's" (the review page shows them the box), and sending one of the two is a 400. The coverage cap reads `regionSlugs` from **this body**, not the stored request, because the moderator can narrow the marzes on the page. → creates `TowTruck` from the body, re-points the request's photos at it, marks the request `APPROVED` and leaves every other stored column untouched as an audit trail. Returns `{ towTruckId, telegramLinkUrl }` |
| `POST` | `/admin/registration-requests/:id/reject` | |
| `GET` | `/admin/profile-changes` | Driver edits awaiting review. Each carries `fields`: **only what differs**, with raw values on both sides — the words for a service, a city or a vehicle type live in the frontend's static data (CLAUDE.md), so labelling is `utils/profileChangeLabels.ts`'s job |
| `GET` | `/admin/profile-changes/count` | `{ pending }` — shown next to the section heading |
| `POST` | `/admin/profile-changes/:id/approve` | Applies it by running the driver's own write path (`MyTowTruckService.applyUpdate`). Can legitimately fail: a photo may have been claimed elsewhere, an admin may have changed the truck's coverage while it waited |
| `POST` | `/admin/profile-changes/:id/reject` | Body: `RejectProfileChangeDto` — the reason is **required** (min 10 chars) and is shown to the driver verbatim |
| `GET` | `/admin/reviews` | Pending (`isApproved: false`) only. Query: `limit` (default 50, max 200), `offset` |
| `POST` | `/admin/reviews/:id/approve` | |
| `POST` | `/admin/reviews/:id/reject` | Deletes the review row outright |
| `GET` | `/admin/tow-trucks` | Every truck, active or not (unlike the public `/tow-trucks` list). Query: `limit` (default 50, max 200), `offset` |
| `GET` | `/admin/tow-trucks/count` | `{ total, active, inactive }` — totals across the **whole table**, independent of the pagination above. `inactive` is `total - active`, never a third `count()`, so the three numbers can't disagree with each other. Declared before every `tow-trucks/:id` route in `admin.controller.ts` so the literal segment `count` can never be swallowed by an `:id` param — see `backend/test/admin.controller.count-route.spec.ts`, which asserts that ordering as a general rule, not just for today's route list. Powers the total shown next to "Էվակուատորներ" in the admin panel (`pages/admin/index.vue`) |
| `PATCH` | `/admin/tow-trucks/:id/active` | Body: `{ isActive: boolean }` — reversible |
| `PATCH` | `/admin/tow-trucks/:id/featured` | Body: `{ isFeatured: boolean }` — drives the public `GET /tow-trucks/featured` list and the homepage "featured" section |
| `PATCH` | `/admin/tow-trucks/:id/heavy-equipment` | Body: `{ heavyEquipment: boolean }` — whether this truck appears on `/tsanr-tehnika` (`?vehicleType=heavy-duty` ORs the type with this flag). Unlike `/featured` it changes public listing results. **Admin-only with no driver counterpart** — see `docs/taxonomies.md` § «Ծանր տեխնիկա». The response echoes the **derived** value: a truck whose `vehicleType` is already `heavy-duty` answers `true` whatever was sent, and nothing is written — so the panel must assign what came back, not what it sent |
| `PATCH` | `/admin/tow-trucks/:id/phone` | Body: `{ phone: string }` (`+374` + 8 digits). Corrects the main login phone — the driver's own dashboard can't touch this field. Rejected with 400 if another **active** truck already uses it (same uniqueness rule as approval) |
| `PATCH` | `/admin/tow-trucks/:id/coordinates` | Body `{ latitude, longitude }` — same `SetCoordinatesDto`, same rule and same messages as the driver's route above, deliberately shared so the two audiences can never validate one value differently. Unlike `/phone` this is **not** an admin-only field: it exists so support can fix a pair pasted in the wrong order without asking the driver to log in. Works on deactivated trucks too |
| `PATCH` | `/admin/tow-trucks/:id/primary-area` | Body `{ citySlug? \| districtSlug?, regionSlug?, locationName }` — the truck's **base**, i.e. the one place it works out of, as opposed to the list of places it covers. Exactly one of city/district, and it must be one of the truck's own served areas: `assertPlacementIsServed` also rejects a corridor sent as a *city* and a district sent as a city. `regionSlug` is nulled for a Yerevan district (pseudo-region). `locationName` is the composed label («Վարդենիս, գյուղ Շատվան») — the backend has no geography and stores it verbatim. Not cosmetic: city listings rank locally-based drivers first. See `docs/locations.md` § "The base". `routeSlug` names a served road corridor as the base: it is validation-only and never stored, and the placement is written empty with the corridor's name as `locationName` — see `docs/locations.md` § "A driver can be based on a road" |
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
| `GET` | `/admin/subscription-payments/plans` | The same plan constants the driver's dashboard reads — so the admin's «record a payment» picker cannot drift from what is on sale |
| `GET` | `/admin/subscription-payments/pending` | Every request waiting on a decision, oldest first, each with the driver who made it |
| `POST` | `/admin/subscription-payments` | Records an off-platform payment as PAID. `{ towTruckId, planId, paidAt? }` — a plan, never an amount. A future `paidAt` is rejected |
| `PATCH` | `/admin/subscription-payments/:id` | `{ status: 'PAID' \| 'CANCELLED' }`. Guarded against two admins deciding the same request — the second gets a 409, not a silent overwrite |

### Reviewing a registration

Approval used to be a verdict on a stored record: the body carried four fields
the registration could not contain (slug, base, coordinates, description) and
`approve()` copied every other column straight off the `RegistrationRequest`. A
moderator who spotted a misspelt surname or a phone with a digit missing could
only approve it wrong and repair it afterwards through half a dozen separate
PATCH endpoints, or reject a real driver and ask them to type the form again.

It is now a form. `/admin/registrations/:id` renders the registration form
pre-filled from the request, editable, and **what is submitted is what gets
created**. Three things follow, and each looks like a bug if you do not know it:

- **The stored request is never edited.** It keeps the driver's original
  submission verbatim — the only surviving evidence of what was actually sent —
  and approval changes exactly one field on it, `status`.
- **There is no draft.** Nothing persists until approval, so leaving the page
  discards the edits. A half-corrected request is not a state anyone should be
  able to observe.
- **Rejecting discards them too**, so a rejected request reads as what the
  driver sent.

The field parity between the two forms is structural on both sides, because
nothing else would hold it: one `RegistrationProfileDto` that both
`CreateRegistrationDto` and `ApproveRegistrationDto` extend, and one
`RegistrationFormFields.vue` that both `/register` and the review page render.
Adding a question to either side is one edit; adding it to one form only is not
expressible. `frontend/tests/registrationFormParity.spec.ts` guards the frontend
half.

Photos are the one thing the review page cannot change — a moderator neither
uploads nor replaces them — which is why `imageIds` is on
`CreateRegistrationDto` alone.

### Driver edits are moderated

A driver's dashboard used to write straight to `TowTruck`. Approval reviewed a
listing once, at registration, and never again — so a driver could raise their
stated capacity, claim coverage they do not serve, or rewrite their description,
and it was live before anyone saw it. `UpdateMyTowTruckDto` documented that
trade-off and named this as the place to undo it.

A save now **queues**. `PATCH /my/tow-truck` creates a `ProfileChangeRequest`
holding only the fields that differ, and the live profile is untouched until a
moderator approves.

Four properties are worth knowing before changing anything here:

- **Approval runs the driver's own write path.** `MyTowTruckService.applyUpdate`
  is the exact code that used to run on save. Re-implementing the write on the
  admin side would mean two places that derive `manipulator`, two that decide
  what an empty string means, and two that check the coverage cap — and an
  approved edit would end up stored differently from the same edit written
  directly.
- **Comparing a stored value is not `JSON.stringify`.** `TowTruck.serviceAreas`
  is a `jsonb` column, and jsonb does not preserve key order — it stores keys
  sorted by length then bytewise, so `{slug, name, type}` goes in and
  `{name, slug, type}` comes out. Comparing the JSON text therefore reported a
  coverage change on **every** save, with a before and after that read
  identically to a moderator. The comparison is key-order-insensitive, and
  `backend/test/profile-change-jsonb.spec.ts` proves the round trip against a
  real Postgres, because nothing short of one can see it.
- **Only the diff is stored, and only the diff is shown.** A corrected phone
  number is a one-key object and one line in the panel. Queuing the whole form
  would also mean approving it rewrote thirty columns to values they already
  held, silently clobbering anything an admin had changed in the meantime.
- **One pending request per truck**, enforced by a partial unique index
  (`WHERE status = 'PENDING'`). Saving again replaces it: two queued edits have
  no defined order, and applying them in arrival order produces a profile
  neither describes.
- **Everything is re-checked at approval**, not trusted from submission time.

The queue is deliberately separate from `registration-requests`: one decides
whether a driver joins the platform, the other whether a change to a published
listing goes live.

Rejection requires a reason, which the driver receives in Telegram and sees on
their dashboard. An unexplained refusal leaves them to guess which change was
the problem, and the likeliest next move is to submit the same thing again.

## List vs detail — two different shapes on purpose

`GET /tow-trucks` used to return the **full profile** of every truck, which meant
one unauthenticated request handed out every driver's secondary phone, WhatsApp,
Telegram and email — the platform's entire contact database — plus descriptions,
price tables, plate numbers and every photo URL that no card renders.

There are now three shapes, and which one you get depends on the endpoint:

| Shape | Endpoints | Contains | Size |
| --- | --- | --- | --- |
| **Coverage** | `/tow-trucks/coverage` | base location, service-area slugs, `works24Hours` | ~230 B/truck, **no personal data** |
| **Card** | `/tow-trucks`, `/tow-trucks/featured` | what a listing card renders: main phone, vehicle summary, services, service areas, one thumbnail | ~1.1 KB/truck |
| **Full** | `/tow-trucks/:slug`, `/my/tow-truck` | everything | ~2.0 KB/truck |

Measured on a representative fixture: the card is 54% of the old list row and
the coverage record 11%.

**The card carries exactly one way to reach a driver — the main phone**, which
is the button it renders. WhatsApp, Telegram, email and the secondary phone are
all profile-only, because `TowTruckContactActions` (the component with those
buttons) is mounted only on `/tow-trucks/:slug`; the card is a deliberate
lightweight teaser with a single «Զանգահարել» link.

`whatsapp` was the exception for a while, kept on the stated justification that
"the card has a WhatsApp button". It did not and never had one — so the field
was published for every driver in bulk, from an unauthenticated endpoint, in
exchange for nothing. That is the same failure the narrowing above was done to
fix, surviving in one field because the justification was never re-checked
against the component. **If a contact channel is added to the card, add the
field back with it — not before**, and `backend/test/card-shape.spec.ts`
asserts the rule.

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
