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
  սպասարկման ուղղություններ"). Shared by `RegistrationFormFields.vue` (so both the public form and the admin review page get it) and the driver
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
everything else costs one, and the budget for those depends on how many marzes
were chosen** — counted across the whole selection, not per region.

| Chosen regions | Districts | Cities + corridors |
| --- | --- | --- |
| Yerevan only | all 12, unlimited | — none available |
| Yerevan + one marz | all 12, unlimited | 2 |
| one marz | — | 3 |
| two marzes | — | **5 in total**, not 5 each |

A second marz raises the budget from 3 to 5 rather than doubling it: covering
two marzes genuinely needs more places than covering one, but not twice as many
— the extra two are for the border between them, not for a second territory.

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
| `POST /registrations` | flat `citySlugs: string[]` + `regionSlugs` | exact outside Yerevan, bound within it |

The backend has no geography and must not grow any (CLAUDE.md), so "is this
Yerevan?" is answered from the payload itself: `type: 'district'` can only mean
Yerevan, because nowhere else in the country has districts. That works wherever
`ServiceAreaDto` is used.

**"One marz or two" is a different question, and the payload cannot answer it.**
Five cities in Lori and five spread over Lori + Armavir are the same typed list;
telling them apart would mean resolving a city to its marz. So the region list has to
reach the check some other way, and the two typed endpoints get it from
different places on purpose:

- **Approval** reads it from the **stored registration request** — the driver's
  own answer is already on disk, so nothing is taken from the request body. An
  `ApproveRegistrationDto.regionSlugs` would have been a way to assert two
  marzes and unlock the looser budget for a selection that is really one.
- **The driver's dashboard** has no stored equivalent to read (the truck keeps a
  single `regionSlug`, not the pair), so `UpdateMyTowTruckDto.regionSlugs`
  carries it — **client-asserted, and knowingly unverifiable**. A driver could
  claim two marzes to get 5 places for one marz. The hard limits still hold
  regardless (2 whenever Yerevan is present, 5 in absolute terms); the 3-vs-5
  difference is a listing-quality rule, not a security boundary, and closing it
  would mean teaching the backend which marz every city belongs to.

Either way the field is validation-only and never stored, and it is optional: a
caller that omits it falls back to the two-marz budget, which is still a correct
bound, so a forgotten field degrades to "too permissive" rather than to "rejects
valid selections". Requests predating `regionSlugs` carry an empty array, which
is read as "unknown" rather than "zero marzes" for the same reason.

Registration is the exception, and deliberately so: `RegistrationRequest.citySlugs`
has always been a plain `String[]`, and giving it types would rewrite the shape
of every pending row in the moderation queue. So that endpoint applies the
tightest bound its payload can prove — 12 districts, plus 2 if a second region
is present, or 5 with no Yerevan. A crafted request could still slip 14 marz
cities past it, and that request **does not become a listing**: it lands in
moderation, and the admin's approval sends the same areas back typed, where the
exact rule rejects them. The exact rule therefore always runs before anything is
published.

### The dashboard rebuilds the region list, and must not lose a corridor

Nothing stores which marzes a driver ticked — the dashboard derives them back
from the areas it loaded (`pages/dashboard.vue`). Each area type needs its own
lookup: districts map to the Yerevan pseudo-region, cities via
`findCityLocation`, and **corridors via `findServiceZoneLocation`**.

That last branch is easy to omit and fails silently, because `findCityLocation`
returns `null` for a zone slug and the `.filter(Boolean)` after it drops the
entry. The result was a driver whose coverage included a corridor loading with
that marz missing: its group never rendered, so the corridor was invisible and
could not be removed — and a driver covering *only* a corridor derived zero
regions and could not save at all, blocked by "Ընտրեք 1-2 մարզ" on a form that
gave them no way to satisfy it. Since the region list now also decides the
coverage budget and is sent to the backend, the same gap would hand them the
wrong limit too. `frontend/tests/serviceAreaLimits.spec.ts` asserts every
corridor in the dataset resolves to its marz, and asserts the premise
(`findCityLocation` really does return null for a zone) so the check cannot
become vacuous.

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

### An admin can remove a single area — and that path skips the cap on purpose

`PATCH /admin/tow-trucks/:id/service-areas` drops one area from an approved
driver. It is the fourth write path for `serviceAreas` and the only one that is
not in the table above, because it is the only one that cannot grow a list.

**It takes the slug to remove, never the resulting list.** That one choice is the
whole safety argument: the server reads what is stored, drops the matching
entries, and writes the remainder back, so no request an admin could craft adds
coverage a driver never claimed. Nothing has to be validated to prevent it, and
two admins removing two different areas from the same truck cannot clobber each
other the way two full-list writes would.

**It deliberately does not call `assertServiceAreasWithinLimit`.** That looks
like a missing check and is the opposite of one. Legacy drivers keep lists of
8-10 areas (see above — nothing was migrated). Running the cap here would throw
on the *result* of the first removal, since 9 is still over the limit, so the
drivers an admin most needs to trim would be the only ones who could not be
trimmed at all. The rule the write needs is "strictly fewer than before", and
removing an entry satisfies it by construction.
`backend/test/admin-service-areas.spec.ts` asserts both halves so nobody
"restores" the check.

**The last area cannot be removed.** An empty `serviceAreas` matches no city,
district or marz filter, so the driver would vanish from every browsing page
while still reading «Ակտիվ» in the panel — a deactivation nobody performed and
nothing displays. The X is disabled with a title explaining it, the backend
refuses it independently, and both messages point at «Ապաակտիվացնել».

**The structural placement follows the removal.** `citySlug`/`districtSlug` must
always name one of the served areas, so removing the area that *is* the
placement re-points it. Which one to re-point to cannot be decided on the
backend — picking it means knowing which surviving slug is a settlement and
which is a road corridor, i.e. geography — so the admin review page resolves it with
the same "first area that is not a corridor" rule `approve()` and the dashboard
use, and sends it. The backend cannot *derive* the answer but it does *check*
it: a placement that is not among the remaining areas is rejected, which needs
no geography, only the stored list. A Yerevan district replacement also nulls
`regionSlug`, or a truck moving into Yerevan would stay listed on the marz it
left. When nothing that survives can be a placement (corridor-only coverage)
both columns go null — the same state `findPlaceSlug` already produces for a
driver, so refusing it would only block a cleanup the data model permits.

Until this existed **an admin could not see a driver's coverage anywhere in the
panel**: `AdminTowTruckSummary` did not carry it, `locationName` is only the
free-text base label, and the pending-request card's «Մարզեր» row shows what was
*submitted*, which stops describing reality the moment the driver edits their own
dashboard. The summary now carries `serviceAreas` plus the three placement slugs
— justified by the same argument that lets it carry `latitude`/`longitude`: the
route is behind `AdminJwtGuard`. The **public** card shape must not grow fields
by copying it (CLAUDE.md § "A listing is not a profile").

## The base: one place a driver works out of

Separate from coverage, and easy to conflate with it. **Coverage** is the list
of places a driver will drive to (`serviceAreas`). The **base** is the single
place they work out of — `TowTruck.citySlug` *or* `districtSlug`, plus
`regionSlug`, plus the `locationName` label the cards render as «Հիմնական
գտնվելու վայրը՝ …».

### Why it stopped being inferred

Approval used to derive it: *the first served area that is not a road
corridor*. That is arbitrary — the order is whatever the driver ticked boxes in
— and it was uncorrectable, because the driver's dashboard re-derived it the
same way on every save, so a wrong value re-created itself.

It became visible the moment city pages started ordering by it (below). A
moderator now picks it explicitly, in `components/admin/PrimaryAreaPicker.vue`,
shared by the approval modal and the per-truck editor for the same reason
`ServiceAreaPicker` is shared by registration and the dashboard.

### The rule — `backend/src/tow-trucks/placement.ts`

**The base must be one of the served areas.** A truck filed under a town it
does not serve ranks *first* on that town's page while being the one driver who
never agreed to go there. `assertPlacementIsServed` is the single copy, used by
all three write paths (approval, the primary-area editor, and the area-removal
endpoint when it re-points a placement it just deleted). It also rejects:

- a **road corridor sent as a city** — `citySlug` is what the city pages filter
  on and there is no «Գառնի–Գեղարդ» page to be filed under. A corridor base is
  expressible, but not like this — see below;
- a **district sent as a city** or the reverse — the two are matched by
  different columns, so a crossed pair means the row is never found at all.

It deliberately does *not* check that `regionSlug` is the marz that city
belongs to, or that a `city` slug is really a city. Both need geography, which
this backend does not have (CLAUDE.md); the panel resolves them from the static
data and sends them, exactly like `ServiceAreaDto.name`.

### A driver can be based on a road

Corridors used to be filtered out of the base picker entirely, on the reasoning
that nobody is "based in" a road. The drivers disagreed: some of them wait on
«Արագած–Ծաղկահովիտ» rather than in a town, and a moderator reviewing one saw two
selects with no honest answer in either.

A corridor base is stored as an **empty placement**:

| Column | Value |
| --- | --- |
| `citySlug` | `null` |
| `districtSlug` | `null` |
| `regionSlug` | the corridor's marz |
| `locationName` | the corridor's name, e.g. «Արագած–Ծաղկահովիտ» |

So the card says where the driver really is, the truck appears on its **marz**
page, and it appears on **no city page** — which is true of it, because it is
not in a city. The picker says that out loud before the choice is made, since it
costs the truck a city listing.

The wire carries `routeSlug` alongside, and it is **validation-only, never
stored** — the same shape as `regionSlugs` on the coverage endpoints. It exists
because "based on a corridor" and "forgot to choose" are otherwise the same
request, and `setTowTruckPrimaryArea` has to refuse the second while accepting
the first. `assertPlacementIsServed` checks the corridor is actually served and
actually a corridor; a settlement sent as `routeSlug` is refused, or the truck
would silently lose the city ranking it was entitled to.

One consequence worth knowing: a truck with an empty placement is now two
different things — a corridor-based driver, and a driver whose coverage is
corridors only and who has no base at all. The columns cannot tell them apart,
and nothing needs to: both belong on a marz page and on no city page.

### `locationName` is composed, never typed

The label is «Վարդենիս», or «Վարդենիս, գյուղ Շատվան» when the driver is parked
in a village. The backend cannot build either — it cannot turn `vardenis` into
Armenian — so `composeLocationName()` in `frontend/utils/primaryArea.ts` builds
it and the string is stored verbatim.

The village half is free text on purpose: it is the one case the select cannot
cover, a driver based somewhere that is not and should not become a filterable
place of its own (that would mean a new entry in `data/cities.ts`, a new page
and a new sitemap URL — for one driver). It changes the label only; `citySlug`
is still the town whose page they rank on.

The editor does **not** try to recover the village half from a stored label. It
would mean parsing a composed string back apart, and a legacy label that never
followed the format would parse into nonsense — so the field starts empty and
asks again, which is a question rather than a silent wrong answer.

### Drivers based here rank first — `sortTowTrucks`

On a city or Yerevan district page the drivers **based** there are ordered above
the ones who merely also cover it; within each tier the existing rating order is
untouched. So being local wins a tie against a stranger but never rescues a
badly-rated driver from the bottom of their own tier.

Three boundaries worth not crossing:

- **Recommended only.** Price is the customer overriding the default with an
  explicit instruction; a local driver above a cheaper one there reads as the
  sort being broken.
- **Matched on the placement, never on `serviceAreas`.** Every driver on a city
  page already serves that city, so matching on coverage would be true for all
  of them and rank nothing.
- **Corridor pages pass no base place at all**, and the boost is then a no-op —
  correct, not a gap, since nobody is based in a corridor. A landing settlement
  borrows its target city's list, so it borrows that city's test too.

`frontend/tests/basePlaceRanking.spec.ts` covers all three.

### Coordinates are stated at approval too

Separate from the base and often confused with it: the base is *which page the
truck is listed on*, the coordinates are *the point the "nearest evacuator"
search measures from* (`docs/nearest-search.md`). A driver can have one without
the other, and most do — the coordinate question is optional at registration and
plenty of drivers skip it.

The pair always flowed through: the request stores it and `approve()` copies it
across. What was missing was that the approval dialog said **nothing** about it,
so a profile went live with no marker and it surfaced only when someone went
looking. Correcting it afterwards was always possible
(`PATCH /admin/tow-trucks/:id/coordinates`); knowing to was the gap.

The dialog now states it either way and offers the same `CoordinatesInput` the
driver saw, pre-filled. `ApproveRegistrationDto.latitude`/`longitude` are
optional and mean "the moderator changed it":

- **neither key** → the driver's own pair, copied across exactly as before;
- **both** → the moderator's, through the same `assertWithinArmenia` a driver's
  pair gets. An admin is not exempt: a transposed pair lands a truck in the
  Indian Ocean regardless of who typed it;
- **one** → 400, same rule and same wording as `RegistrationService`.

Still optional at approval, deliberately: a driver who could not manage the
copy-paste is better approved without a marker than blocked behind one. That is
the same call the registration form makes, and the reason its fallback note
tells them to leave the box empty rather than paste the example.

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
