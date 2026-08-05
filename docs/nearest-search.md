# Nearest evacuator search (`/evakuator`)

A visitor presses one button, the browser hands over their position once, and
the page shows the drivers nearest to them with a road distance and a driving
estimate. Read `docs/data-model.md` § `TowTruck` first for where a driver's
coordinates come from — this document is only about what is done with them.

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
| **OpenRouteService** | Free key, 2,500 req/day, 40k/month, 3,500 locations per matrix. One visitor search is one request, cached 5 minutes — orders of magnitude of headroom. **Chosen.** |
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
backend/src/nearest/
  nearest.module.ts            imports TowTrucksModule for the card path only
  nearest.controller.ts        POST /nearest-tow-trucks — public, throttled 10/60s
  nearest.service.ts           the two steps, the ranking, the cache lookup
  nearest.repository.ts        the ONLY place PostGIS is touched (raw SQL)
  route-matrix.service.ts      OpenRouteService; every failure returns null
  nearest-cache.service.ts     5-minute in-memory cache, rounded keys, size cap
  nearest.constants.ts         every tunable number
  nearest.types.ts             API shapes
  dto/find-nearest.dto.ts      two validated numbers, nothing else

frontend/
  pages/evakuator.vue                        the page — nothing happens until the button
  components/nearest/NearestTowTrucksCta.vue the shared CTA (banner + inline variants)
  components/nearest/NearestResultCard.vue   distance strip + the existing TowTruckCard
  composables/useGeolocation.ts              one-shot lookup, per-code Armenian messages
  repositories/nearest.repository.ts
  utils/formatDistance.ts                    «Ճանապարհով՝ մոտ 4.1 կմ» / «Մոտավոր՝ 8 րոպե»
  types/nearest.ts
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
