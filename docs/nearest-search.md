# Nearest evacuator search (`/evakuator`)

A visitor presses one button, the browser hands over their position once, and
the page shows the drivers nearest to them with a road distance and a driving
estimate. Read `docs/data-model.md` § `TowTruck` first for where a driver's
coordinates come from — this document is only about what is done with them.

## The switch — and what it deliberately does NOT switch

`NEAREST_SEARCH_ENABLED` in `frontend/constants/features.ts`. **It is currently
`true`** — the search itself is live.

While `false`, it turns off **one thing**: `findNearest()` answers with «Այս
պահին աշխատում ենք այս գործառույթի վրա» instead of asking the browser for a
position. The check sits before `locate()`, so no permission prompt is ever
raised — a browser that is refused once remembers it, and spending that prompt
on something we cannot yet deliver would cost us the one we want at launch.

Everything else stays exactly where it is regardless of the flag, and this is
the part to not "tidy up":

| Stays visible while `false` | Why |
| --- | --- |
| The header nav link | It is how visitors learn the feature is coming |
| All seven in-content CTA banners | Same — the banners are the announcement |
| `/evakuator` in `sitemap.xml` | The page is real content either way, and the URL keeps its history instead of appearing for the first time on launch day |

The intent is that someone presses, reads that it is being worked on, and
leaves knowing the site will do this. Hiding the entry points until launch day
would mean launching to an audience that has never heard of it. So the page is
written as an **announcement, not an error**: the full explanation renders, and
the region/city search is offered underneath.

Nothing on the backend is aware of this flag. The module, its endpoint, the
PostGIS column and the migration all stay live, so resuming the feature is this
boolean plus a frontend rebuild — no API redeploy, no migration to re-run.

## The one sentence the whole feature has to keep saying

> **Every distance here is measured from the parking spot the driver typed into
> their profile, not from where their truck is right now.**

This is not live tracking and never has been: nothing in the system knows where
a truck is. The page states it in full above the results, and the wording is
load-bearing rather than legal boilerplate — a stranded person will plan around
"8 րոպե", and the number is only honest if they know what it was measured from.

## Two steps, and why neither is enough alone

```
POST /api/v1/nearest-tow-trucks  { latitude, longitude }
        │
        ▼  NearestService
  1. PostGIS: 25 nearest ACTIVE drivers within 150 km      ← straight line, indexed, free
        │
        ▼
  2. OpenRouteService: ONE matrix request, 1 origin × 25   ← road metres + seconds
        │
        ▼
  rank by road distance, slice to 10, cache 5 minutes
```

- **Straight-line distance is a good filter and a bad ranking.** A driver 3 km
  away across a gorge is further by road than one 6 km away on the highway. So
  step 1 decides *who is plausible* and step 2 decides *who is actually
  nearest*.
- **That is why step 1 hands over 25 candidates and the visitor sees 10.**
  Reordering can only be correct if there is something to reorder; if the
  prefilter returned exactly 10 the matrix call would be a formatting step. A
  matrix request costs the same at 5 destinations or 30, so the prefilter is
  sized generously (`NEAREST_CANDIDATE_LIMIT`).
- **150 km is a real bound, not a safety margin.** A driver that far away is not
  an answer to "who can reach me", and without a radius the KNN operator walks
  the whole country to fill 25 slots.

## PostGIS

`TowTruck.location` is a `geography(Point, 4326)` column, `GENERATED ALWAYS AS`
the projection of `latitude`/`longitude`, `STORED`, with a partial GiST index on
the rows where it is not null.

Three decisions worth not re-litigating:

- **Generated, not maintained.** `latitude`/`longitude` stay the source of
  truth — they are what a driver enters, what the API validates and what every
  form reads back. The point is recomputed by Postgres on every write, so it is
  structurally impossible for it to disagree with the numbers. A
  separately-written geometry column is a second thing to keep in sync, and it
  eventually is not.
- **`geography`, not `geometry`.** Distances come back in **metres** on the
  WGS84 spheroid with no projection step and no degrees-to-kilometres fudge.
  Marginally slower; irrelevant at this data volume.
- **Partial index.** A driver with no coordinates has a NULL location and can
  never be a result, so indexing them would be pure write cost. Today that is
  most of the table.

`ST_MakePoint` takes **X then Y — longitude first**. Reversed, every distance
comes back plausible and every one is wrong. It appears in three places (the
migration, `NearestRepository`, `RouteMatrixService`) and is spelled out at each.

**Prisma cannot express `GENERATED ALWAYS`.** The column is declared as
`Unsupported("geography(Point, 4326)")?` purely so schema and database agree and
drift detection stays quiet; it is excluded from the generated client entirely,
so there is no typed path that could write it. If `prisma migrate dev` is ever
allowed to regenerate this column it will emit a plain `ADD COLUMN` and silently
drop the generation clause, leaving a column that is permanently NULL — see
`docs/data-model.md` § Migrations for why migrations here are hand-authored.

## Route matrix: OpenRouteService

One origin, many destinations, one request. 25 separate route calls would be 25×
the latency, 25× the quota and 25 chances for one to fail and leave a
half-answered page.

**Why ORS and not the alternatives:**

| | Verdict |
| --- | --- |
| **OpenRouteService** | Free key, 3,500 locations per matrix, one visitor search is one request, cached 5 minutes. This deployment's key is capped at **500 req/day** — `NearestQuotaService` tracks calls against that real number, not an advertised one. **Chosen.** |
| OSRM public demo | Free, no key, but its own usage policy is non-commercial, ≤1 req/s, no uptime guarantee, withdrawable without notice. Fine for a local experiment. |
| Self-hosted OSRM | Removes those problems, adds an OSM extract, a preprocessing pipeline and ~1 GB RAM to the VPS that already runs everything else. |

`RouteMatrixService` is a class, not an interface with implementations. The seam
that matters is `matrix()`'s signature — origin + destinations in, metres and
seconds out — and swapping providers is rewriting one method body.

### Failure is a normal outcome

Every failure path returns `null`: bad key, quota exhausted, timeout, DNS, a
malformed body. The search then falls back to the PostGIS straight-line
distance, `routed: false` travels in the response, and the page says «Ուղիղ
գծով» with an explanation — **and shows no time at all.**

That last part is the rule: a duration cannot be derived from a straight line
without inventing an average speed, and an invented arrival time is the one
number on this page a stranded person would actually plan around.

`ROUTE_MATRIX_API_KEY` is optional and blank by default, so a deploy without a
key is a working deploy with a smaller answer rather than a broken one — and it
means the fallback path is exercised, not theoretical.

## The visitor's position is never stored

- **Never written to the database.** There is no table, no column and no row.
- **POST, not GET.** A query string ends up in nginx's `access.log`, which would
  put a visitor's exact coordinates on disk next to their IP and a timestamp —
  turning a value the system deliberately never stores into one that is stored
  by default. A body is not logged.
- **The cache key is a neighbourhood.** Coordinates are rounded to 3 decimal
  places (~110 m) before becoming a key. That is what makes the cache useful —
  two people on the same street share an entry, so a burst of nearby searches
  costs one upstream request — and it is the only form in which a position
  exists anywhere on the server. It evaporates on TTL expiry or process restart.
- **Nothing is logged.** `RouteMatrixService` logs the HTTP status of a failed
  request and never the body, because the body echoes the coordinates.
- Validated with the same `assertWithinArmenia` a driver's own coordinates go
  through. A browser reporting a position outside the country is either someone
  genuinely abroad or a spoofed payload; neither has an answer here.

Rate limit: **10 requests / 60s per IP** (`@Throttle` override, stricter than the
global 60/60s) because a cache miss costs an external request against a metered
quota. Cache: **5 minutes**, in-memory, capped at 500 entries — without a cap a
script walking coordinates in 110 m steps would grow the heap until the process
died.

## How often one person may search

Three limits, in front of each other, answering three different questions.
They are easiest to keep straight by who they are keyed on:

| Limit | Keyed on | Number | Question it answers |
| --- | --- | --- | --- |
| Result cache | rounded position | 5 min | "has *anyone nearby* just asked this?" |
| Remembered answer | one browser | **1 hour** | "has *this person* just asked this?" |
| Daily allowance | one browser | **2 / day** | "how many *road-distance* answers does a person get?" |
| Per-minute throttle | IP | 10 / min | burst control |
| ORS daily budget | platform-wide | **480 matrix calls / day** | "is today's shared routing budget gone?" |

### The allowance takes away road data, not the search

**Nothing on this page ever refuses to answer.** `NEAREST_DAILY_SEARCH_LIMIT`
(2/day, per browser) buys **detailed** answers — the ones carrying road
distances and driving times, which cost a call against the metered external
quota. Once it is spent, the page goes on searching, **unlimited**: it sends
`skipRouting: true` and the backend answers with the same complete, ranked
list of nearest drivers measured «Ուղիղ գծով». Only the road figures wait
until tomorrow.

That asymmetry is the whole design. The expensive half of a search is one ORS
call; the PostGIS half costs a single indexed query and is effectively free,
so rationing it would save nothing and cost everything — someone standing next
to a broken car on their third look of the day is the last person who should
meet an empty screen. `frontend/tests/nearestSearchLimits.spec.ts` asserts
there is no early exit between reading the limit and calling the API, because
restoring an `if (limitReached) return` guard is the tidy-looking change that
would bring the dead end back.

The page says which of the two reasons produced a straight-line list, and they
are not interchangeable: «այսօրվա մանրամասն որոնումներն օգտագործված են» is a
rule working as designed and resets at midnight, «ծառայությունն այս պահին
հասանելի չէ» is an outage. Reporting either as the other is a lie the visitor
cannot act on.

#### Why the client is trusted with `skipRouting`

Every other "can the client be trusted?" rule in this codebase exists because
a client could ask for **more** than it is entitled to. This flag can only ask
for **less**: a request carrying it is strictly cheaper to serve, and the worst
a forged `true` achieves is a worse answer for the forger. The inverse flag —
"route this one for me anyway" — must never be added, since it would let anyone
spend the shared budget at will.

The two answers are separated in the result cache (`…|nr` key suffix) so they
cannot serve each other wrongly. A **routed** entry satisfies both kinds of
request and is checked first: it is strictly better and free to hand over. A
**straight-line** entry is never served to a caller who still has allowance —
otherwise one visitor past their limit would warm the cache for a whole ~110 m
square and silently degrade everyone else there for five minutes.

### The ORS budget is global — it used to be per-IP, and that was wrong

`NEAREST_DAILY_SEARCH_LIMIT = 2` (`frontend/constants/nearest.ts`) is the
**product rule**, per person, with visible copy: «Օրական 2 որոնման
սահմանաչափը սպառվել է։ Խնդրում ենք փորձել վաղը»։

An earlier version of this feature also had `NEAREST_DAILY_IP_SEARCH_LIMIT = 40`,
a per-IP abuse ceiling meant to protect the ORS quota. It was removed, because
it protected the wrong quantity: this deployment's real ORS budget is
**500 requests/day** (not the larger figure sometimes advertised for the free
tier in general — see § Route matrix), and a per-IP number set low enough to
matter still lets a modest handful of distinct addresses — a dozen or so, doing
nothing unusual — collectively exceed a platform-wide budget that small. Making
the per-IP number small enough to actually bound that risk (closer to
`NEAREST_DAILY_SEARCH_LIMIT`) would have re-created the CGNAT problem instead:
Armenian mobile carriers share one public address across many phones, so a
low per-IP number refuses real people, not abusers.

`NEAREST_ORS_DAILY_QUOTA = 500` and `NEAREST_ORS_DAILY_SAFETY_MARGIN = 20`
(`backend/src/nearest/nearest.constants.ts`) now cap the thing that actually
runs out — total matrix calls made today, counted once, platform-wide — with
20 calls of headroom against a burst. `NearestQuotaService` tracks this single
counter; there is no per-caller table to size or evict.

### Running out degrades the search — it does not refuse it

Once the daily budget is spent, `NearestService` stops calling ORS entirely for
the rest of the Armenia day: the PostGIS step still runs, the visitor still
gets a list, it is just ranked by straight-line distance with no times — the
same `routed: false` state the page already renders for an ORS outage. There is
**no 429 for this**, deliberately: running out of a shared daily budget is not
any one visitor's fault, so nobody is told to wait. Note the visitor-facing
allowance behaves the same way for a different reason — see "The allowance
takes away road data, not the search" above. Neither limit on this page has a
"come back tomorrow" dead end; both only ever remove the road figures.

### Counted on work done, not requests received

`NearestQuotaService.consume()` runs only once the result cache has missed and
the search is actually about to call ORS (past the cache lookup, inside
`NearestService.search`). A request served from the 5-minute cache costs
nothing upstream, so it costs nothing against the budget either.

The browser follows the same rule for its own allowance. An allowance is spent
only when a fresh answer that actually bought road data was delivered — a
refused permission prompt, a failed request, a press inside the remembered
hour, and a straight-line-only search past the limit all cost nothing.

### The hour, and what it does to the permission prompt

Pressing the button checks, in this order: **fresh remembered answer → the
browser's position → the search** (with today's allowance deciding only
whether that search asks for road data). The first step is the feature. A
visitor inside the hour is shown the same list instantly, with **no permission
prompt and no request at all** — which also means a browser that would
remember a refusal is never asked a second time for something already
answered.

The list then carries the time it was computed («Ցուցակը կազմվել է 14:32-ին»),
because an hour-old answer to "who is near me" is indistinguishable from a live
one otherwise, and this page's whole discipline is not letting a number look
more current than it is.

When the hour has passed **and** the allowance is gone, the press runs a fresh
straight-line search rather than showing the stale list under a notice — the
list is newer, the visitor may have moved, and it costs nothing. The remembered
answer is still overwritten with it (that is what spares the *next* press a
geolocation prompt), but the allowance counter is not touched: there is nothing
left to charge, and counting past the limit would make the "N of 2 left" figure
on screen nonsense.

### What the browser stores — and what it deliberately does not

Two `localStorage` keys, `evakuators:nearest-result` and
`evakuators:nearest-quota`: **the answer, a timestamp, and a counter. Never the
coordinates.** The promise in "The visitor's position is never stored" below is
unchanged by this cache, because caching the *answer* rather than the *question*
is what keeps it true — serving a remembered list needs the list, not the place
it was computed from. `frontend/tests/nearestSearchLimits.spec.ts` asserts no
coordinate ever enters the stored shape, since "also save the position so we can
refresh silently" is the plausible change that would quietly break it.

Neither browser-side rule is a security boundary — storage can be cleared and
incognito starts fresh. That is expected: they shape the behaviour of the
overwhelming majority who never try, and the global ORS budget cap is what
actually protects the quota regardless of what any one browser does. **Do not
"harden" them by fingerprinting the browser**, which would turn an anonymous
page into a tracking one — the trade already refused in "What is deliberately
not here".

The day boundary is **Asia/Yerevan**, shared with the backend through
`ARMENIA_TIMEZONE` in `backend/src/common/armenia-day.ts` (which
`ANALYTICS_TIMEZONE` now re-exports, so the string exists once) and
`yerevanDateKey()` in `frontend/utils/formatters.ts`. A UTC day would make
«փորձեք վաղը» come true at 04:00 Yerevan time, and a device-local day would
make it depend on the reader's clock.

## The results reuse the existing card, deliberately

`NearestResultCard` wraps `TowTruckCard`; it does not replace it. The card
already renders the «Զանգահարել» button, which fires both trackers through
`usePhoneActions` — the external analytics *and* the driver's own dashboard
counter, which is also what triggers the "someone just took your number"
Telegram notice (`docs/analytics.md` § "Side effect: driver contact notices").

A purpose-built card for this page would have had to reimplement that button,
and the day it was reimplemented slightly differently is the day a driver stops
being notified. The distance strip therefore sits *outside* the card: nothing
about `TowTruckCard` changes, and every other listing on the site is unaffected
by this feature existing.

Cards are fetched through `TowTrucksService.getCardsByIds()`, the same path
every listing uses, so they carry ratings and exactly the columns the public
listing publishes — the PostGIS query returns **ids and distances only**, so
there is no second place where a card gets assembled.

## Empty and denied states

Both are ordinary outcomes with their own copy, and both end by pointing at the
region/city search that does have answers:

- **Permission denied** — names the lock icon in the address bar, because that
  is the thing the visitor has to press.
- **Position unavailable / timeout** — different advice (go outside, try again);
  a single "could not get your location" for all three leaves nothing to try.
- **No drivers within 150 km** — not an error. Says so, and offers `/regions`
  and `/yerevan`.

Empty results are cached like any other: "nobody near this village" is a stable
answer for five minutes, and it is exactly the query a bored visitor repeats.

## Files

```
backend/src/common/
  armenia-day.ts               ARMENIA_TIMEZONE + armeniaDateKey — shared with analytics

backend/src/nearest/
  nearest.module.ts            imports TowTrucksModule for the card path only
  nearest.controller.ts        POST /nearest-tow-trucks — public, throttled 10/60s
  nearest.service.ts           the two steps, the ranking, the cache and quota lookups
  nearest.repository.ts        the ONLY place PostGIS is touched (raw SQL)
  route-matrix.service.ts      OpenRouteService; every failure returns null
  nearest-cache.service.ts     5-minute in-memory cache, rounded keys, size cap
  nearest-quota.service.ts     global daily ORS-call budget, NOT the 2/day rule and NOT per-IP
  nearest.constants.ts         every tunable number
  nearest.types.ts             API shapes
  dto/find-nearest.dto.ts      two validated numbers, nothing else

backend/test/
  nearest-quota.spec.ts        day rollover, cache hits are free, the ceiling stays a ceiling

frontend/
  pages/evakuator.vue                        the page — nothing happens until the button
  components/nearest/NearestTowTrucksCta.vue the shared CTA (banner + inline variants)
  components/nearest/NearestResultCard.vue   distance strip + the existing TowTruckCard
  composables/useGeolocation.ts              one-shot lookup, per-code Armenian messages
  composables/useNearestSearch.ts            the 1-hour memory + the 2/day allowance
  constants/nearest.ts                       both visitor-facing numbers and the storage keys
  repositories/nearest.repository.ts
  utils/formatDistance.ts                    «Ճանապարհով՝ մոտ 4.1 կմ» / «Մոտավոր՝ 8 րոպե»
  types/nearest.ts
  tests/nearestSearchLimits.spec.ts          the day key, and the order the page checks things in
```

Dependencies are inbound only — nothing outside `backend/src/nearest/` depends
on it, so the backend half can be removed by deleting the folder and one line in
`app.module.ts`. The two additions elsewhere (`findCardsByIds`,
`getCardsByIds`) are ordinary listing methods that stand on their own.

## Deployment

PostGIS is a **prerequisite, not a migration step** on a database whose role is
not a superuser:

```bash
# once per server, matching the Postgres major version
apt install postgresql-16-postgis-3
# once per database, as postgres
sudo -u postgres psql -d evakuators -c 'CREATE EXTENSION IF NOT EXISTS postgis;'
```

The migration repeats `CREATE EXTENSION IF NOT EXISTS postgis;` so doing it
either way is safe and repeatable. Then the routine deploy applies —
`npx prisma generate` before `npm run build` is mandatory here, since this
release changes the schema.

`ROUTE_MATRIX_API_KEY` is optional. Without it the page works and shows
straight-line distances with no times.

## What is deliberately not here

- **No embedded map.** An interactive picker needs the Google Maps JavaScript
  API, an API key, a billing account, a third-party script on the page and a
  consent story for it — to replace a button the visitor presses once.
- **No stored search history**, no visitor position analytics, no "drivers near
  you" notifications. Each would turn a transient coordinate into personal data.
- **No live driver positions.** That is a different product with a different
  privacy model, a driver-side app and a consent flow; the copy on the page is
  written so that adding it later is an improvement rather than a correction.
