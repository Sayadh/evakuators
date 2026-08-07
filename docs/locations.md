# Locations: service zones, settlements, and location search

Three additions to the static geography described in CLAUDE.md § "Core
architectural decision" and `docs/taxonomies.md`. All three are frontend-only
static data, same standing as `frontend/data/{regions,cities,districts}.ts` —
the backend still has no geography of its own. Read this before touching
anything under `frontend/data/{serviceZones,settlement}.ts`,
`frontend/utils/{locationSearch,settlements,transliteration}.ts`, or the
`type: 'route'` branch of `TowTrucksRepository.buildWhere`.

## 1. Service zones — road corridors as coverage

`frontend/data/serviceZones.ts` — `ServiceZone { id, regionId, name, slug }`,
12 entries. A named road corridor a driver works as a whole — «Գառնի–Գեղարդ»,
«Տաթև–Հալիձոր». Drivers asked for these because the places along them aren't
cities and the road is what they actually cover.

**A zone is not a settlement and implies nothing about the settlements on
it.** Picking «Գառնի–Գեղարդ» means "I work that road", not "I serve Գառնի"
and not "I serve Գեղարդ". A zone matches on its own slug and nothing else —
no expansion, no radius, no fallback to a nearby city. See the type's own doc
comment in `frontend/types/location.ts` for why it's a separate `ServiceZone`
type rather than a `City` with a flag.

The one place a zone behaves like a city: covering a zone in a marz counts
as serving that marz, the same as covering one of its cities does (region
rollup in `TowTrucksRepository.buildWhere` and
`services/towTrucks.service.ts`'s `servesRegion`). Without this a driver
whose only coverage was a corridor would be invisible on the marz page.

### Wire format — `type: 'route'`

`TowTruck.serviceAreas` already held `{ slug, name, type }` for cities and
districts (see `docs/data-model.md`). A zone is a third `type: 'route'`
value:

```ts
// backend/src/tow-trucks/dto/service-area.dto.ts
@IsIn(['city', 'district', 'route'])
type!: 'city' | 'district' | 'route'
```

**Manual sync point**: this string set must equal `LocationType` in
`frontend/types/enums.ts`. Both directions of `TowTruck.serviceAreas` compare
`type` literally (`array_contains: [{ slug, type: 'route' }]` in
`tow-trucks.repository.ts`), so a mismatch means a driver's zone coverage
silently matches nothing.

Zone slugs share **one namespace** with city and district slugs — all appear
as `serviceAreas[].slug` and all resolve at `/regions/:region/:slug` (see
§ 3 below). A new zone slug must not collide with an existing city or
district slug in the same marz.

### Filtering (`backend/src/tow-trucks/tow-trucks.repository.ts`)

```ts
// Exact match only — no citySlug-style fallback, a zone isn't a base location
if (filters.zoneSlug) {
  or.push({ serviceAreas: { array_contains: [{ slug: filters.zoneSlug, type: 'route' }] } })
}
// Region rollup
for (const zoneSlug of filters.regionZoneSlugs ?? []) {
  or.push({ serviceAreas: { array_contains: [{ slug: zoneSlug, type: 'route' }] } })
}
```

Query params: `GET /tow-trucks?zone=<slug>` and `?regionZones=<slug>,<slug>`
(comma-joined, mirrors `regionCities`) — see
`TowTrucksService.list()` mapping `query.zone`/`query.regionZones` to
`zoneSlug`/`regionZoneSlugs`.

### Frontend surfaces

- **Picker**: `components/common/ServiceAreaPicker.vue` — each region group
  shows its cities and, if any, its zones as a second sub-list ("Հավելյալ
  սպասարկման ուղղություններ"). Shared by both `register.vue` and the driver
  dashboard, same as the rest of that component — see CLAUDE.md § "Manual
  sync points" for why that sharing matters.
- **Filtering a listing**: `useTowTrucksByZone(zoneSlug)`
  (`composables/useTowTrucks.ts`) → `towTrucksService.getByZoneSlug()` →
  `GET /tow-trucks?zone=`. Mock-mode equivalent is `servesZone()` in
  `services/towTrucks.service.ts`.
- **Region rollup on the frontend**: `getRegionServiceZoneSlugs()` /
  `getRegionServiceZones()` in `utils/geography.ts` — read by both the picker
  and `servesRegion()`.
- **Page**: a zone renders at the same route as a city — see § 3.

## 2. Settlements — 300 villages routed to existing pages

`frontend/data/settlement.ts` — `StaticSettlement`, ~300 entries. Sourced
from ՀՀ վարչատարածքային բաժանման մասին օրենք (Հավելված 2,
arlis.am/hy/acts/25976) for the official list, OSM/HDX populated places and
GeoNames for coordinates/alternate names where sources disagreed; a handful
of names got an explicit manual override, noted in the file's own header
comment.

**No new database table, no seed data.** A settlement is not something a
driver picks as coverage — it's a name a visitor might type that doesn't
have its own page. Adding one is editing a TypeScript array, same as adding
a city.

```ts
interface StaticSettlement {
  id: number
  regionId: number
  targetCityId: number          // fallback target, always present
  name: string
  slug: string
  aliases: string[]
  type: 'village' | 'town'
  seoMode?: 'landing' | 'redirect'   // omitted → old targetCityId-only behavior
  targetServiceZoneId?: number       // takes priority over targetCityId when set
  indexable?: boolean
  seo?: { title, description, heading, intro }
}
```

### Three outcomes for a settlement URL — `resolveSettlementRouting()`

`frontend/utils/settlements.ts` is the single place this decision is made;
everything else (the redirect middleware, the city/zone page, the sitemap)
calls into it or into the `resolveSettlementTarget()` it shares with
`locationSearch.ts`, so routing and search can never disagree about where a
settlement points.

| Settlement config | `resolveSettlementRouting()` result | What happens |
| --- | --- | --- |
| `targetServiceZoneId` set | `{ kind: 'redirect', target }` | Permanent 301 to the corridor's page — see § below |
| No zone, `seoMode: 'landing'` + `indexable: true` + `seo` present | `{ kind: 'landing', settlement, cityRoute }` | Own page at `/regions/:region/:slug`, listing its `targetCityId`'s drivers |
| Neither (the ~276 with no routing fields) | `{ kind: 'city', target }` | No URL of its own — just contributes its name/aliases to its target city's search entry |

A `'landing'` settlement genuinely has no coverage of its own — there's no
settlement-level field for it and none is invented. It lists the drivers of
its `targetCityId`, on the honest basis that a village's tow truck coverage
*is* its nearest town's.

### Redirects — `server/middleware/settlement-redirect.ts`

Zone-targeted settlements 301 from their own URL to the corridor's, **in
server middleware, not a page-level redirect**. A page that renders then
redirects has already returned 200 with a body — a crawler or a cold
`curl` sees a soft redirect, not a real one. Middleware answers before any
rendering starts. The redirect map is built once at module scope from the
same `resolveSettlementTarget()` the search index uses.

### Landing pages — `pages/regions/[region]/[city].vue`

One route resolves three things: a city, a zone (§ 1), or a landing
settlement — they share a URL shape, a listing, filters and a breadcrumb
trail, and two page files can't match one Nuxt dynamic segment anyway. City
and zone slugs are checked not to collide (§ 1); a landing settlement is
only reached here because a redirect settlement was already answered by the
middleware above, and a non-routed settlement has no URL to reach this page
with at all.

```
findStaticServiceZone(slug) + region match → isZone
findSettlement(regionSlug, slug), isLandingSettlement() → isLanding
useCity(regionSlug, slug) → city (fallback if neither of the above)
```

`isLanding` pages get `noindex, follow` when they have zero drivers — a page
that would rank for a village name and then show an empty list is a thin
page, not a useful one. Same rule is mirrored in the sitemap (below), so a
crawler and the page itself never disagree about whether a URL is worth
indexing.

### Sitemap — `server/routes/sitemap.xml.ts`

Two additions: every `ServiceZone` at `priority: 0.6`, and
`getIndexableLandingPaths()` walking `getLandingSettlements()` (every
settlement where `isLandingSettlement()` is true) and keeping only the ones
with at least one driver — the same "empty landing page" rule the page
itself applies, kept from drifting apart by calling the one shared
`isLandingSettlement()` predicate rather than re-deriving the condition.

## 3. Location search — one index, three scripts

`frontend/utils/locationSearch.ts` builds one module-scope search index over
cities, Yerevan districts, marzes (+ the Yerevan pseudo-region), zones, and
settlements — ~800 normalized strings, built once at import, identical on
server and client so SSR and hydration can't disagree. See the file's own
doc comment for why one index rather than four, and why module scope rather
than rebuilding it per keystroke.

### Three scripts, one comparison key — `utils/transliteration.ts`

The same town is typed three ways: «Երևան», `yerevan`, «Ереван». Every
indexed term and every typed query is reduced through `toSearchKey()` to one
script-agnostic key — transliterate Armenian/Cyrillic to Latin, then fold
the handful of ways Armenian romanisation genuinely varies (`kh`/`gh`/`g` →
`x`, `ts` → `c`, `dz` → `z`, `zh` → `j`, initial `ye`/`h` dropped, doubled
letters collapsed). **This is not a phonetic fuzzy-matcher** — every fold
rule is a real, observed spelling variation, documented inline in the file,
and deliberately does not reach for things it can't safely reach (e.g.
«Эчмиадзин» vs «Էջմիածին» — a genuinely different name, not a spelling of
the same one, left to the settlement's own hand-written `aliases`).

Read `frontend/tests/transliteration.spec.ts` before changing a fold rule —
it pins the specific city/village pairs each rule exists for, and the one
case (`ts`/`dz` mismatch) that is intentionally left unfixed.

### Ranking and dedup

`searchLocations(query)` scores every index entry (`rank()`): exact
canonical name match, then exact alias, then prefix, then substring — and
deduplicates by **destination** (`result.key`), not by matched term, so
«Գառնի» and «Գեղարդ» — two different words pointing at one corridor — offer
one row, not two. `findLocationExact()` is the same lookup collapsed to "is
there exactly one destination for this", used by tests and anywhere that
needs a yes/no answer rather than a dropdown.

City/district entries are indexed **before** settlements specifically so
that when a term is ambiguous — «Արարատ» is a marz, a town, AND a village —
the earlier, page-owning entry wins. This is also how `city:ararat` keeps
its own URL when a settlement in the same marz happens to share its slug.

### UI — `components/location/LocationAutocomplete.vue`

A free-text combobox next to the region → area `<select>` cascade — the
cascade can't answer «Պտղնի» because a village isn't an option in either
select. 180ms debounce (typing, not a network request — the index is
static and in memory), full keyboard nav (arrows wrap, Enter, Esc), ARIA
combobox/listbox roles. Every colour on its white dropdown panel is set
explicitly rather than inherited — see `docs/architecture.md`-style note in
the component itself: it renders inside the hero, which sets `color: #fff`
on everything under it, and a panel that inherited that would be invisible
white-on-white text (this shipped once; the fix is why the rule is called
out).

### Validation — `utils/locationDataValidation.ts`

`validateLocationData()` checks the static datasets for the mistakes that
are easy to make by hand and easy to miss in review: a `targetCityId` /
`targetServiceZoneId` pointing at nothing, a target in a different marz than
its settlement, and slug collisions across cities/districts/zones/settlements
within a marz. Run it (or extend it) whenever a settlement/zone entry is
added — see `frontend/tests/locationData.spec.ts` for how it's exercised.

## How many places a driver may claim

A listing that claims everywhere is worth nothing to the person searching, so
coverage is capped. The rule is one sentence: **Yerevan's districts never count;
everything else costs one, and the budget for those is 2 when Yerevan is among
the chosen regions and 5 when it is not** — counted across the whole selection,
not per region.

| Chosen regions | Districts | Cities + corridors |
| --- | --- | --- |
| Yerevan only | all 12, unlimited | — none available |
| Yerevan + one marz | all 12, unlimited | 2 |
| one marz | — | 5 |
| two marzes | — | **5 in total**, not 5 each |

Picking two marzes is still allowed (`MAX_REGIONS` is unchanged) — the cap is on
places, not on regions.

**A road corridor costs exactly what a city costs.** «Գառնի–Գեղարդ» is one
answer to "where do you work", and making it cheaper would reopen the hole the
cap exists to close.

### Where it is enforced, and why in three different ways

| Write path | Payload | Check |
| --- | --- | --- |
| `PATCH /my/tow-truck` | typed `ServiceAreaDto[]` | exact rule |
| `POST /admin/registration-requests/:id/approve` | typed `ServiceAreaDto[]` | exact rule |
| `POST /registrations` | flat `citySlugs: string[]`, **no types** | provable bound |

The backend has no geography and must not grow any (CLAUDE.md), so "is this
Yerevan?" is answered from the payload itself: `type: 'district'` can only mean
Yerevan, because nowhere else in the country has districts. That works wherever
`ServiceAreaDto` is used.

Registration is the exception, and deliberately so: `RegistrationRequest.citySlugs`
has always been a plain `String[]`, and giving it types would rewrite the shape
of every pending row in the moderation queue. So that endpoint applies the
tightest bound its payload can prove — 12 districts, plus 2 if a second region
is present, or 5 with no Yerevan. A crafted request could still slip 14 marz
cities past it, and that request **does not become a listing**: it lands in
moderation, and the admin's approval sends the same areas back typed, where the
exact rule rejects them. The exact rule therefore always runs before anything is
published.

### Drivers approved before the cap existed

Their stored coverage is left exactly as it is — nothing was migrated, and no
row was rewritten. The check runs only when `serviceAreas` is actually present
in an update, so an over-cap driver keeps their listing until the first time
they edit their areas, at which point they are asked to trim. Silently deleting
a driver's own choices would be worse than asking.

The picker shows the same state rather than fixing it for them: the counter
turns red («Ընտրված է 7-ը՝ հասանելի 5-ից — հեռացրեք 2-ը շարունակելու համար») and
already-ticked options stay untickable-off. **A selected area is never
disabled**, whatever the count says — reaching the cap must not trap someone
with no way to change their mind.

That same over-budget state is reachable without any old data: pick two marzes
and five cities, drop one marz, then add Yerevan, and the budget falls from 5 to
2 while the ticks survive.

## Adding a new zone or settlement

**New service zone**: append to `staticServiceZones` with a fresh `id` and a
`slug` that doesn't collide with any city/district/settlement in the same
marz. That's the whole change on the geography side — the picker, filtering,
and sitemap all pick it up automatically since they iterate the array. If any
settlement should redirect to it, give that settlement's entry a
`targetServiceZoneId` pointing at the new zone's `id`.

**New landing settlement** (giving an existing `city`-routed settlement its
own page): add `seoMode: 'landing'`, `indexable: true`, and the `seo` block
(`title`, `description`, `heading`, `intro`). Leave `targetCityId` as-is —
that's still whose drivers the page lists. Do not also set
`targetServiceZoneId`; a settlement is either a landing page or a
zone-redirect, not both (`resolveSettlementRouting()` checks the zone case
first, so setting both silently makes it a redirect).

**Either way**: run `frontend/tests/locationData.spec.ts` and
`locationSearch.spec.ts` (`npm run test` — see `docs/testing.md`) before
committing; they're what catches a dangling id or a slug collision before it
reaches production.
