# Provider analytics

Per-tow-truck statistics: every driver sees how their own profile is
performing in `/dashboard`, and an admin sees the same numbers for any truck
from `/admin`. **This is not Google Analytics** — it is an internal counter
system scoped to one profile at a time, and it is the only place in this
codebase where anonymous visitor behaviour is written to our own database.

Read `docs/architecture.md` first for the layering rules this module follows,
and `CLAUDE.md` for the frontend/backend split of static vs dynamic data.

## The one rule the whole design exists to serve

> **The same visitor must not increase a statistic more than once per
> calendar day, in Armenia time.**

If a visitor opens a profile 100 times today, Page Views goes up by **1**. If
they press "Զանգահարել" 20 times, Phone Clicks goes up by **1**. Tomorrow
(00:00 Asia/Yerevan) they can count again. Not a rolling 24 hours — a
calendar day.

Every non-obvious decision below follows from that sentence.

## Two tables, two different jobs

```
POST /analytics/events
        │
        ▼
  AnalyticsVisitorDay          ← the dedup ledger: "this visitor already did
  (towTruckId, statDate,          this, to this truck, on this day"
   eventType, visitorKey)        UNIQUE → the database is the arbiter
        │
        │ only if that insert was actually new
        ▼
  AnalyticsDailyStat           ← the aggregate: one counter per
  (towTruckId, statDate,          (truck, day, event type)
   eventType, eventCount)        the ONLY table dashboards read
```

- **`AnalyticsDailyStat`** is pre-aggregated and tiny: at most 5 rows per
  truck per day, and only for days with traffic. Dashboard and chart queries
  cost O(days in the selected period), never O(events ever recorded). Kept
  forever.
- **`AnalyticsVisitorDay`** is the row-per-visitor-per-day ledger. It is the
  table that grows with traffic, and it exists for exactly two purposes: the
  dedup constraint, and `COUNT(DISTINCT visitorKey)` for the unique-visitors
  metric. Purged on a retention schedule (see below).

`eventCount` therefore never means "how many times was the button pressed".
It means **"how many distinct visitors did this on this day"**. Anyone reading
the column later needs to know that; it's why the schema comment says so too.

## Event flow, end to end

```
Visitor opens /tow-trucks/ashot-tow-service
  → pages/tow-trucks/[slug].vue onMounted()          (client only, never SSR)
  → useAnalyticsTracking().trackPageView(truck.id)
      ├─ bails out if !import.meta.client            (a server render is not a visit)
      ├─ bails out if !isApiEnabled()                (mock mode has no backend)
      ├─ getOrCreateVisitorId()                      (cookie ?? localStorage ?? new UUID v4)
      └─ POST /api/v1/analytics/events { towTruckId, eventType, visitorId }
          (fire-and-forget: not awaited, errors swallowed)
  → AnalyticsController                              (throttled 60/60s, returns 202, empty body)
  → AnalyticsTrackingService.track()
      ├─ TowTrucksRepository.findStatusById()        (exists? active? — 404 / silent ignore)
      └─ AnalyticsEventFactory.create()
            ├─ statDate  = AnalyticsClock.today()    ← SERVER decides the day
            └─ visitorKey = sha256(visitorId + pepper) ← raw id never stored
  → AnalyticsRepository.recordEvent()                (one SQL statement, see below)
```

Visitor clicks Call / WhatsApp / Telegram / Email → the same path, from
`usePhoneActions`. That composable is the single funnel every contact button in
the app already went through, which is why the tracking lives there: a new
place to press "call" is counted automatically, and it is not possible to add
an untracked contact button.

## The write: one statement, zero race conditions

`AnalyticsRepository.recordEvent()` is raw SQL on purpose. The naive
implementations are all broken under concurrency, and the concurrency is real
— an impatient double-tap on "Զանգահարել" is two simultaneous requests:

| Approach | What goes wrong |
| --- | --- |
| `findUnique` then `create` | Both requests read "not counted yet", both increment. Lost update. |
| Prisma `upsert` | Still select-then-write for a composite key, and can't express "increment only if the dedup row was new". |
| Both calls in a `$transaction` | READ COMMITTED means both still see "no row"; one then fails the unique constraint *after* incrementing. Double count or lost event depending on statement order. |

What actually runs:

```sql
WITH new_visitor_day AS (
  INSERT INTO "AnalyticsVisitorDay" (...)
  VALUES (...)
  ON CONFLICT ("towTruckId","statDate","eventType","visitorKey") DO NOTHING
  RETURNING 1 AS counted
)
INSERT INTO "AnalyticsDailyStat" (..., "eventCount", ...)
SELECT ..., 1, ... FROM new_visitor_day
ON CONFLICT ("towTruckId","statDate","eventType")
DO UPDATE SET "eventCount" = "AnalyticsDailyStat"."eventCount" + 1
```

- The unique index arbitrates. Exactly one of N concurrent identical requests
  gets a `RETURNING` row; the rest produce no rows from the CTE.
- The aggregate INSERT selects **from that CTE**, so it runs once or not at
  all. `DO UPDATE SET eventCount = eventCount + 1` is an atomic row-locked
  increment, not a read-modify-write.
- One statement is implicitly its own transaction, so it is impossible to end
  up with a dedup row whose counter was never incremented (or vice versa).
- One round-trip. No retry loop, no advisory lock, no `SERIALIZABLE`.

Verified against Postgres (including 50 parallel identical events → counter
stays at 1) — see "Verification" at the end.

## Timezone: why `Asia/Yerevan` is a constant and not `+4`

The VPS runs UTC. A UTC day boundary would reset every driver's statistics at
04:00 Yerevan time, which is both wrong and confusing to explain. So the
calendar day is resolved through the ICU timezone database:

```ts
new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yerevan', … }).format(instant)
// → '2026-07-27'
```

`en-CA` is not a stylistic choice — it is the locale whose short date format
is exactly ISO `YYYY-MM-DD`. Armenia has no DST today, but nothing here
hardcodes `+4`, so if that ever changes this code doesn't.

The canonical currency inside the module is that **date key string**, not a
`Date`. Passing `Date` objects around is exactly how an event at
`2026-07-27T23:30+04:00` ends up in the 2026-07-26 bucket. It becomes a `Date`
only at the Prisma boundary (`dateKeyToDate`), and the column is a plain
Postgres `DATE`.

`AnalyticsClock` is the single place that reads the system clock, so "what day
is it in Armenia" cannot be answered inconsistently by two callers, and
"what happens at 23:59 Yerevan time" is a unit test rather than a midnight
vigil.

## Visitor identification

- Anonymous, no login. A random **UUID v4** generated in the browser
  (`frontend/utils/visitorId.ts`), stored in **both** a first-party cookie
  (`ev_visitor_id`, ~2 years, `SameSite=Lax`) **and** `localStorage`.
- Both are written, either is accepted. That is not redundancy for its own
  sake: Safari's ITP caps script-written cookie lifetime at 7 days, while some
  privacy tools prune cookies but not storage. Two stores means a returning
  visitor is much less likely to be miscounted as new.
- If the visitor clears both, they **are** a new visitor. Documented
  behaviour, not a bug. The alternative — fingerprinting — would be fragile
  and a genuine privacy intrusion for a counter on a tow-truck listing.
- Generated client-side, never server-side: the site is SSR'd, so a
  server-generated id would mean `Set-Cookie` on every render and two writers
  for one value. One writer, in the browser.
- **Stored hashed.** `sha256(visitorId + pepper)`, hex, in `visitorKey`. A
  database dump can't be replayed against anyone's browser or joined against
  another system's identifiers. Plain sha256 rather than bcrypt/argon2 is
  deliberate: this runs on the hottest path in the system and the input is a
  122-bit random UUID, not a guessable human secret, so a slow KDF would buy
  nothing.
- Pepper comes from `ANALYTICS_VISITOR_PEPPER`, falling back to
  `DRIVER_JWT_SECRET` (the same secret that signs driver session tokens — one
  convention for "the driver-side secret"). **Rotating it makes every returning
  visitor look new from that
  moment on**; historical aggregates are unaffected because they hold no keys.

## Index design, and why there are only three

| Index | Serves | Why this exact shape |
| --- | --- | --- |
| `AnalyticsDailyStat (towTruckId, statDate, eventType)` UNIQUE | the aggregate UPSERT's conflict target **and** every dashboard/chart read | The leading `(towTruckId, statDate)` prefix already answers "one truck, date range", so a separate read index would be dead weight that only slows writes. |
| `AnalyticsVisitorDay (towTruckId, statDate, eventType, visitorKey)` UNIQUE | the once-per-day rule **and** `COUNT(DISTINCT visitorKey)` | `visitorKey` is deliberately **last**. That makes the unique-visitors query an **index-only scan** — the metric needs no second index and never touches the heap. Confirmed with `EXPLAIN`. |
| `AnalyticsVisitorDay (statDate)` | the retention purge only | The purge filters `statDate` across *all* trucks, so it cannot use the `towTruckId`-leading index above. |

No index on `eventType` alone (never queried without a truck — see the one
exception below), none on `visitorKey` alone (never looked up by visitor —
that would be the one query this design refuses to support), and no
`createdAt` index (audit column, not a filter).

**The one query that IS "eventType without a truck": `countUniqueVisitorsSiteWide`**
(§ "Platform-wide active callers" below) deliberately does not get a fourth
index. It reuses the standalone `(statDate)` index the retention purge already
relies on, which is bounded by the retention window regardless of platform
size — the same accepted cost class as the purge itself, run far less often. A
fourth index `(eventType, statDate, visitorKey)` would make it index-only, and
is the documented fix if this ever becomes a hot path — not a pre-emptive
addition for one occasional admin read.

## Retention

`ANALYTICS_VISITOR_DAY_RETENTION_DAYS = 180`, purged by a daily cron
(`AnalyticsTrackingService.purgeExpiredVisitorDays`, 04:00).

It **must stay strictly greater than the longest selectable period** (90
days). The unique-visitors metric reads that table directly, so purging inside
the selectable window would make old unique counts silently shrink. That
constraint is the reason `AnalyticsPeriod` is a closed enum instead of
free-form `from`/`to` query params — a caller cannot ask for a window the
retention policy can't honour.

`AnalyticsDailyStat` is never purged. A driver keeps their lifetime counters
forever; only the ability to de-duplicate visitors across ancient windows is
dropped.

## How each dashboard number is calculated

`GET /my/analytics?period=LAST_30_DAYS` issues four queries **concurrently**
(none depends on another, so the endpoint costs one round-trip's latency):

| Number | Source | Query |
| --- | --- | --- |
| Total Page Views | `AnalyticsDailyStat` | `SUM(eventCount)` grouped by `eventType`, windowed |
| Unique Visitors | `AnalyticsVisitorDay` | `COUNT(DISTINCT visitorKey)` where `eventType = PAGE_VIEW`, windowed |
| Phone / WhatsApp / Telegram / Email Clicks | `AnalyticsDailyStat` | same grouped read as page views |
| all-time counters | `AnalyticsDailyStat` | same read with no date filter |
| Reviews: confirmed / pending | `Review` | one `groupBy(isApproved)` with `_count` |
| Ratings: confirmed / pending average | `Review` | the same `groupBy`, with `_avg(rating)` |

### Page views vs unique visitors — they are supposed to differ

`totals.PAGE_VIEW` is the **sum of daily unique viewers**: someone returning
on three days counts three times. `uniqueVisitors` is **distinct visitors
across the whole window**: that person counts once. Both are correct and they
answer different questions, which is why the dashboard shows both and each
card carries a one-line hint explaining itself.

There is deliberately **no all-time unique visitors** figure. It would be
computed from the purged ledger, so it would quietly *decrease* over time.
Showing nothing is more honest than showing a number that shrinks.

### Review and rating counters

Not period-scoped. A review from four months ago is still the driver's current
reputation, unlike a page view. Pending (unmoderated) reviews are shown to the
driver — dashed border, "Սպասում է" badge — because a driver who just received
three five-star reviews needs to see them arrive, or they assume the reviews
were lost. Averages render as `—` when there are no reviews: no reviews means
*no* rating, not a 0.0 rating.

### Charts

`GET /my/analytics/charts?period=…` returns one point per day, **zero-filled
server-side** from the requested range rather than from the returned rows.
Without that, a 30-day chart with traffic on 4 days would render as a 4-point
line and read as continuous activity. The frontend chart never has to reason
about gaps.

## Side effect: driver contact notices

A counted `PHONE_CLICK` / `WHATSAPP_CLICK` also fires a Telegram message to the
driver — `DriverNotificationService` (`backend/src/telegram/`), invoked
fire-and-forget from `AnalyticsTrackingService.track()`.

**Why it hangs off analytics rather than off the click handler.** The dedup
constraint is exactly the rate control this needs. `recordEvent()` returns
`true` only for a genuinely new (visitor, truck, day, event) combination, so
one notice means one interested person — not one finger. A driver whose number
is tapped five times by the same visitor gets one message. That is why the
feature has no throttle of its own, and deliberately shouldn't: suppressing a
*second, different* caller would break the one thing the notice is for.

**Why the wording is what it is.** Pressing "Զանգահարել" opens the dialer; it
does not place a call, and the visitor may never complete it. So the message
says only what was observed — «Հենց նոր ձեր համարը վերցրել են Evakuators.am-ից՝
ձեզ զանգելու համար» — and never predicts a call. The attribution is the whole
point (the driver connects the ringing phone to us), but a notice that
overpromises stops being believed, and then attribution fails permanently.
Do not "improve" this copy into a claim.

**There is no opt-out.** Every driver with a linked Telegram gets these; the
only thing that suppresses a notice is having no `telegramChatId` yet. This is
a deliberate product decision — the notices exist so drivers attribute their
work to the platform, and a driver who silences them stops attributing.

The cost of that decision used to be severe: these notices rode the **same bot
as the login codes**, so a driver who found them noisy and muted or blocked the
bot lost the ability to sign in at all. Password login removed that
(`docs/auth-and-security.md`) — blocking the bot now costs notices, not access.

What remains is narrower. The bot still carries the one-time password handover,
so a driver who blocks it **before** tapping their link can never be given a
password, and from their side that is indistinguishable from a wrong one. The
mitigation is still the warning in the link-confirmation message. If support
sees "I can't log in", check the bot's send failures for that chat before
debugging the login path.

**One column on `TowTruck`:** `contactNoticeIntroAt` — when the one-time
"here's why you get these" explanation was appended. Claimed atomically via
`claimContactNoticeIntro()` (an `updateMany` whose `WHERE` includes
`contactNoticeIntroAt: null`), so two simultaneous clicks can't both send it;
released again if the send fails, so a Telegram outage doesn't consume it.
Same principle as `recordEvent()` — the database arbitrates, never a
read-then-write in application code.

**No inline button.** The notice arrives while the driver's phone is about to
ring; it has to be readable at a glance from a lock screen and nothing else.

Every failure path is swallowed and logged at `warn`. A blocked bot must never
surface to the visitor who just pressed a button, and the notice is never
awaited — the browser is being handed off to `tel:` at that moment.

## Platform-wide active callers

`SiteAnalyticsOverviewApi.callers` — the admin panel's «Ակտիվ զանգողներ» card.
Answers a question none of the per-truck dashboards can: not "did people call
*this* listing" but "are people calling drivers at all". Someone who called
three different drivers is three per-truck unique visitors and **one**
platform-wide active caller; only a query with no `towTruckId` in it can say
that.

**Not a `SiteEventType`.** `SiteVisitorDay`/`SiteDailyStat` only ever recorded
`SITE_VISIT` and `FREE_ROUTES_VIEW` (see below) — a phone click is, and stays,
a **per-truck** event, written to `AnalyticsVisitorDay`/`AnalyticsDailyStat`
by the same `recordEvent()` every contact button already goes through. This
metric reads those same two tables with the `towTruckId` predicate left out,
rather than inventing a new write path or a third table. `PHONE_CLICK`
specifically — not WhatsApp/Telegram/email — because "active caller" is what
was asked for, named as a constant
(`ANALYTICS_SITE_WIDE_CALLER_EVENT_TYPE`) rather than inlined at each call
site, same reasoning as `ANALYTICS_UNIQUE_VISITOR_EVENT_TYPE`.

Two new `AnalyticsRepository` methods, both intentionally the only ones in the
class with no `towTruckId` parameter:

- `countUniqueVisitorsSiteWide(eventType, range)` — `COUNT(DISTINCT
  visitorKey)` over `AnalyticsVisitorDay`, windowed. Not index-only (see the
  index-design note above) — accepted, because the query is bounded by the
  180-day retention window and run rarely (an admin panel, not a hot path).
- `sumEventTypeSiteWide(eventType, range?)` — `SUM(eventCount)` over
  `AnalyticsDailyStat`, the small never-purged aggregate table, so an
  all-time read (`range` omitted) costs the same class of query as a
  windowed one — same reasoning as `sumByEventType`.

`AnalyticsDashboardService.getSiteOverview` calls both alongside the existing
`SiteAnalyticsRepository` queries, all four concurrently — deliberately
sourced from **two different repositories** in one method, which is the one
place in this module that happens: `callers` needs the per-truck tables,
everything else in that response needs the site-wide ones, and there is no
third table that would make them the same query.

**Testing note.** This sandbox has no Postgres to repeat the real-engine
verification the rest of this module got (see "Verification performed"
below). What's covered instead
(`backend/test/analytics-site-wide-callers.spec.ts`) is the part that doesn't
need a database: `sumEventTypeSiteWide`'s range/no-range branching (a bug in
the ternary could silently drop the `eventType` filter), and a regression
guard asserting `countUniqueVisitorsSiteWide`'s raw SQL text never mentions
`towTruckId` — the one property the whole method exists for, confirmed to
actually fail when a `towTruckId` clause is reintroduced. The `COUNT(DISTINCT
…) … BETWEEN` shape itself rides on `countUniqueVisitors`'s own real-Postgres
verification (same statement, one predicate fewer), not a fresh unverified
path.

## Site-wide traffic (admin panel)

A second, smaller pair of tables answers two questions about the **platform**
rather than about one driver: how many people opened the site, and how many
opened Ազատ երթուղիներ.

`SiteDailyStat` / `SiteVisitorDay` are the per-truck design with the truck
removed — same one-statement CTE dedup, same visitor hash, same retention cron
(`purgeExpiredVisitorDays` purges both ledgers with one cutoff). Read
`AnalyticsRepository.recordEvent()` first; `SiteAnalyticsRepository` repeats the
shape without repeating the reasoning.

**Why separate tables and not a nullable `towTruckId`.** That column is part of
both unique constraints and leads every index on the per-truck pair. Making it
nullable would change what every existing driver-facing query means, and `NULL`
would silently stand for "not a driver's number" in code that has no idea the
case exists. Two small purpose-built tables are cheaper than one overloaded one.

**Where the events come from.** `SITE_VISIT` fires from `app.vue`'s `onMounted`
— that component mounts once per page session for every route, including ones
that skip the default layout. `FREE_ROUTES_VIEW` fires from the free-routes
page. Both go through `useAnalyticsTracking`, which keeps a module-scoped
`Set` of events already sent this session: without it a visitor clicking
through five pages would fire five `SITE_VISIT` requests, four of them
guaranteed server-side no-ops. That set is a request-saving cache only — the
database is still the sole authority on whether something counted.

**Reading the two numbers.** `uniqueVisitors` is distinct people across the
whole window; `totals` sums the per-day deduplicated counts. Someone who visits
on Monday and Friday is 1 unique visitor and 2 visits. Neither derives from the
other, which is why the admin panel shows both.

### Relationship to Google Analytics

GA (`nuxt-gtag`, id in `nuxt.config.ts`) is installed and stays — it answers
acquisition questions this module never will: which channel, which country,
which landing page, returning vs new. What it cannot do is appear inside
`/admin` without a Google Cloud service account, the GA4 Data API, a stored
private key and that API's reporting latency. These two numbers were wanted
*in the panel*, next to the moderation queue, so they are computed from data we
already collect with machinery we already own. Use GA for marketing analysis;
use this for the operational number an admin checks daily.

## API

All paths under the global `/api/v1` prefix. See `docs/api-reference.md` for
the table alongside every other endpoint.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `POST` | `/analytics/events` | none | Body `{ towTruckId, eventType, visitorId }`. `202` + empty body. Throttled 60/60s. A counted contact event also fires a driver Telegram notice — see above |
| `GET` | `/my/analytics` | driver JWT | Overview cards + review/rating counters. `?period=` |
| `GET` | `/my/analytics/charts` | driver JWT | Daily series, zero-filled. `?period=` |
| `GET` | `/my/analytics/reviews` | driver JWT | Own reviews incl. unmoderated. `?status=CONFIRMED\|PENDING\|ALL&limit=` |
| `GET` | `/my/analytics/ratings` | driver JWT | 1→5 histogram + averages |
| `GET` | `/admin/tow-trucks/:id/analytics` | admin JWT | Same four reports, any truck, active or not |
| `GET` | `/admin/tow-trucks/:id/analytics/charts` | admin JWT | |
| `GET` | `/admin/tow-trucks/:id/analytics/reviews` | admin JWT | |
| `GET` | `/admin/tow-trucks/:id/analytics/ratings` | admin JWT | |
| `POST` | `/analytics/site-events` | none | Body `{ eventType, visitorId }`, no target id. `202` + empty body, same throttle |
| `GET` | `/admin/site-analytics` | admin JWT | Site-wide visits + Free Routes views. `?period=` |

Paths follow this codebase's existing conventions (`/my/*` for own data,
`/admin/tow-trucks/:id/*` for the admin family) rather than a `/provider/…`
shape — there is no "provider" concept in this schema, the entity is
`TowTruck`.

## Security

**A driver can never read another driver's analytics, and it isn't enforced by
a check — it's enforced by there being no id to tamper with.**

- `MyAnalyticsController` takes `towTruckId` from `request.towTruckId`, which
  `DriverJwtGuard` sets from the JWT's `sub` claim. There is no `:id` param, no
  `towTruckId` query param and no body on any driver route. A driver cannot
  *express* the request "show me someone else's analytics". That is stronger
  than validating ownership after the fact.
- `AnalyticsDashboardService` has no notion of "the current user", cannot be
  asked for "all trucks", and physically cannot return data for a truck other
  than the id it was handed. Both controllers share it, so the two dashboards
  can never compute a number differently.
- `isActive` is re-checked on **every** driver read, not just at login — same
  as `MyTowTruckService`. A driver deactivated mid-session holds a valid 30-day
  JWT and must lose access immediately.
- Admin reads are existence-checked only: an admin *should* be able to inspect
  a deactivated truck's history, since that's usually why they deactivated it.
- The tracking endpoint returns **202 with an empty body** whether the event
  counted, was a same-day duplicate, or targeted a deactivated truck. Reporting
  "duplicate" would turn it into an oracle for "has this visitor id been here
  today" — a privacy leak about other people's browsing. Only an unknown
  `towTruckId` is a 404, and truck ids are already public via `GET /tow-trucks`.
- Every input is a validated DTO. `forbidNonWhitelisted` (main.ts) makes any
  extra field a 400. `visitorId` must be a real UUID v4 — not just "a string" —
  so a client can't pass an oversized or attacker-chosen key. `limit` is capped
  by a constant, because "authenticated" is not "trusted with an unbounded
  query".
- Spam resistance is structural, not just rate-based: the dedup constraint
  means **even an unthrottled flood cannot inflate a number**. The throttle
  (60/60s, stricter than the global default) protects the database from the
  write attempts, not the integrity of the statistics.

## Files

```
backend/src/analytics/
  analytics.module.ts               3 controllers (one per authorisation model), 6 providers
  analytics.controller.ts           POST /analytics/events — public, throttled
  my-analytics.controller.ts        GET /my/analytics/* — DriverJwtGuard, id from JWT
  admin-analytics.controller.ts     GET /admin/tow-trucks/:id/analytics/* — AdminJwtGuard
  analytics-tracking.service.ts     WRITE half + retention cron
  analytics-dashboard.service.ts    READ half — all four reports, both audiences
  analytics.repository.ts           the only file that touches Prisma
  analytics-event.factory.ts        untrusted request → trusted domain record
  analytics-clock.service.ts        the only reader of the system clock
  analytics-visitor-key.service.ts  sha256 + pepper
  analytics.mapper.ts               rows → API shapes, zero-filling
  analytics.constants.ts            every tunable number/string
  analytics.enums.ts                AnalyticsEventType (from Prisma), AnalyticsPeriod, AnalyticsReviewStatus
  analytics.types.ts                API + internal row interfaces
  analytics.utils.ts                pure date-key helpers (no clock access)
  dto/track-event.dto.ts
  dto/analytics-period.query.ts
  dto/analytics-reviews.query.ts

backend/test/
  analytics-site-wide-callers.spec.ts   sumEventTypeSiteWide + countUniqueVisitorsSiteWide

frontend/
  constants/analytics.ts            labels, card definitions, cookie/storage keys
  types/analytics.ts                mirrors the backend API shapes
  utils/visitorId.ts                get-or-create the anonymous UUID
  composables/useAnalyticsTracking.ts   client-only, mock-aware, never throws
  repositories/analytics.repository.ts  track + driver/admin report APIs
  components/analytics/AnalyticsDashboard.vue      container, used by BOTH dashboards
  components/analytics/AnalyticsOverviewCards.vue  the six cards, driven by constants
  components/analytics/AnalyticsChart.vue          dependency-free SVG bar chart
  components/analytics/AnalyticsRatingBars.vue     1→5 histogram
  components/analytics/AnalyticsReviewList.vue     reviews incl. unmoderated
```

Also touched: `TowTrucksRepository.findStatusById()` (lean existence probe),
`ReviewsRepository` (three grouped-query methods), `usePhoneActions` (fires
both trackers), `pages/tow-trucks/[slug].vue`, `pages/dashboard.vue`,
`pages/admin.vue`.

Dependencies are inbound only — nothing outside `backend/src/analytics/`
depends on it, so the whole feature can be removed by deleting the folder and
one line in `app.module.ts`.

## Labels live in the frontend (as everywhere else here)

The backend returns bare `AnalyticsEventType` keys and numbers. Card titles,
period names, icons and ordering are `frontend/constants/analytics.ts`
(`ANALYTICS_OVERVIEW_CARDS`), consistent with this project's core rule that
Armenian labels are a frontend concern (see `CLAUDE.md`). Adding a card is one
entry in that array, not new markup.

**Manual sync point:** `AnalyticsEventType` in `frontend/types/enums.ts` must
match `enum AnalyticsEventType` in `backend/prisma/schema.prisma`
character-for-character — the values travel over the wire in both directions
and are used as response object keys. Nothing enforces this at compile time,
same as the `available-24-7` slug (see `CLAUDE.md` § "Manual sync points").

## No charting library

The requirement is "one series of non-negative integers over consecutive
days". Chart.js would add ~60KB to a page drivers open on mobile and force
client-only rendering, to draw rectangles. `AnalyticsChart.vue` is hand-rolled
SVG: renders during SSR, themes itself from the existing CSS custom
properties, and needs zero JavaScript to be readable. Hover tooltips are
native `<title>` elements, so they also work for screen readers with no
tooltip state to manage.

## Caching

Nothing is cached today, deliberately. A single PM2 instance, and a driver who
just got a page view expects to see it — a 60s in-memory cache would make the
dashboard feel broken, and wouldn't survive horizontal scaling anyway.

`ANALYTICS_CACHE_KEYS` / `ANALYTICS_CACHE_TTL_MS` exist so that when a Redis
cache is introduced, the key format is decided in one place rather than
invented at each call site.

## Local development

Analytics needs a real backend — with `NUXT_PUBLIC_API_BASE_URL` empty the
tracking composable no-ops (by design; see `docs/architecture.md`'s mock/API
switch), and `/dashboard` + `/admin` don't function in mock mode at all.

```bash
cd backend && npx prisma migrate deploy && npx prisma generate && npm run start:dev
cd frontend && npm run dev
```

Then open a tow truck profile, press the contact buttons, and reload
`/dashboard`. To watch dedup work, press the same button repeatedly — the
counter must not move. To simulate a different visitor, clear the
`ev_visitor_id` cookie **and** `evakuators:visitor-id` in localStorage (both,
or the surviving one is reused).

Useful SQL while developing:

```sql
SELECT "statDate", "eventType", "eventCount"
FROM "AnalyticsDailyStat" WHERE "towTruckId" = 1 ORDER BY "statDate" DESC;

-- who is deduped today
SELECT "eventType", COUNT(*) FROM "AnalyticsVisitorDay"
WHERE "towTruckId" = 1 AND "statDate" = CURRENT_DATE GROUP BY "eventType";
```

## Deployment

Nothing new is required. `ANALYTICS_VISITOR_PEPPER` is optional (falls back to
`DRIVER_JWT_SECRET`), so the routine deploy applies:

```bash
git pull
cd backend && npm install && npx prisma generate && npx prisma migrate deploy && npm run build
cd ../frontend && npm install && npm run build
pm2 restart ecosystem.config.js
```

`npx prisma generate` before `npm run build` is mandatory here — this release
adds Prisma models, so a stale client fails the build with
`Property 'analyticsDailyStat' does not exist on type 'PrismaService'`. See
`docs/deployment.md`'s "stale Prisma Client" trap.

## Verification performed

The write path was executed against a real Postgres engine (not mocks) with
the actual migration SQL applied. All of the following passed:

- 100 page views from one visitor on one day → `eventCount = 1`
- 20 phone clicks from that visitor → separate counter, also `1`
- a second distinct visitor → `2`
- the same visitor on the next calendar day → a new row at `1`
- a second tow truck is fully isolated
- **50 parallel identical events → `eventCount = 1`, ledger holds one row**
- period page views `= 4` while unique visitors `= 3` for the same data
  (a returning visitor counted once)
- retention purge removes ledger rows and leaves aggregates untouched
- deleting a `TowTruck` cascades both analytics tables
- `EXPLAIN` on the unique-visitors query reports
  `Index Only Scan using "AnalyticsVisitorDay_towTruckId_statDate_eventType_visitorKe_key"`
  — the index-only claim above is measured, not assumed

These were one-off checks against a real engine, from before this repo had a
configured test runner. A runner exists now (`vitest`, see `docs/testing.md`),
and it never touches a real database — so newer additions to this module
(§ "Platform-wide active callers") are covered by mocked-Prisma tests instead,
which is a different, narrower guarantee: application logic around a query,
not the query's own correctness against a real engine. `recordEvent`'s
concurrency guarantee and `AnalyticsClock`/`analytics.utils.ts`'s timezone
guarantee remain the two highest-value places to add real-engine verification
if a Postgres-backed test environment is ever set up.

## Future scalability

Roughly in the order it would actually start to hurt:

1. **Cache the dashboard reads** (Redis, 60s, keys already defined). First
   thing worth doing once more than a handful of drivers check daily.
2. **Batch the write path.** Today one interaction is one round-trip. If
   traffic ever makes that the bottleneck, buffer events in memory and flush
   every few seconds — the dedup constraint means replaying a buffered event is
   safe, so the buffer needs no durability guarantees.
3. **Partition `AnalyticsVisitorDay` by month** (`PARTITION BY RANGE
   (statDate)`). Retention then becomes `DROP PARTITION` — instant, no dead
   tuples, no `VACUUM` pressure — instead of a large `DELETE`. This is the
   single highest-leverage change at scale, and the current schema is already
   shaped for it (`statDate` leads the purge index).
4. **Move tracking off the request path** with a queue if the endpoint's write
   volume ever affects public page latency.
5. **Roll up into monthly aggregates** if `AnalyticsDailyStat` itself grows
   uncomfortable (100k trucks × 365 days × 5 types ≈ 180M rows/year *if every
   truck had traffic every day*; realistically far less, since rows only exist
   for days with traffic).
6. **Second Postgres instance / read replica** for analytics reads, if
   dashboard queries ever compete with the public listing. Nothing in this
   module writes to a table any other feature reads, so it is cleanly
   separable.

Deliberately **not** planned: cross-site visitor tracking, IP storage,
device/browser fingerprinting, per-visitor journey reconstruction. None of them
serve the question a driver is asking ("is my listing working?"), and each
would turn an anonymous counter into personal data.
