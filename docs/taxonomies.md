# Taxonomies — the single-source-of-truth constants pattern

Service zones (road corridors) and settlements (villages) follow this same
static-constants pattern but are documented separately, in `docs/locations.md`
— they're geography, not a taxonomy of options a driver picks from a list.

This codebase has been refactored more than once to fix the same class of
bug: the same list of options (services, capacity ranges) got defined
slightly differently in two or three places (registration form, driver
dashboard, public filter), and they'd drift apart. The fix each time was the
same pattern — put the list in exactly one file, have every picker/filter
import from it. When adding a new option to any of these, **only edit the
constant file** — every consumer updates automatically.

## Services — `frontend/constants/services.ts`

`ServiceType` enum (`frontend/types/enums.ts`) is the exhaustive list of
service slugs, grouped into 5 fixed categories by `SERVICE_CATEGORIES`:

1. `core` — Էվակուատորի ծառայություններ (what kind of vehicles it transports)
2. `roadside` — Ճանապարհային օգնություն
3. `recovery` — Դուրսբերման ծառայություններ
4. `payment` — Վճարման տարբերակներ
5. `availability` — Աշխատանքային պայմաններ (includes `Available247`)

`SERVICE_CATEGORIES` drives the checkbox UI in `ServiceCategoryPicker.vue`,
used identically in the registration form, the driver dashboard's own-profile
editor, and (indirectly, via the same category grouping) the public filter
sidebar. `SERVICE_LABELS` is the flat slug → Armenian label lookup used
wherever a bare list of `services: string[]` needs to render as text (tow
truck cards, profile pages).

**Backend cross-reference:** the backend is almost entirely blind to
individual service slugs — it stores `services: String[]` opaquely — with
exactly one exception: `AVAILABLE_24_7_SLUG` in
`backend/src/tow-trucks/service-slugs.ts`, which **must** equal
`ServiceType.Available247`'s value (`'available-24-7'`) character-for-character.
This is what lets the backend derive `TowTruck.works24Hours` as a real
sortable boolean column without knowing anything else about the services
taxonomy. Nothing enforces this match at compile time — if you ever rename
this specific slug in the frontend enum, you must also rename the backend
constant, or 24/7 sorting silently breaks.

### The specialist vehicles are asked a different list

`serviceCategoriesFor(vehicleType)` is the one resolver every form calls. It
returns the five categories above for an ordinary evacuator, and for the two
specialist types it swaps the first three for one list of their own:

| Vehicle type | Categories offered |
| --- | --- |
| `flatbed`, `sliding-platform` | all five |
| `manipulator` | `MANIPULATOR_SERVICES` + payment + working conditions |
| `heavy-duty` | `HEAVY_TRANSPORT_SERVICES` + payment + working conditions |

«Ակումուլյատորի գործարկում», «անվադողի փոխարինում» and «դուրսբերում ցեխից» are
sold to a stranded motorist. A crane truck is dispatched to a site against a
booked job; it is not what anyone calls from the roadside, and the platform
already withholds it from every general listing for exactly that reason. Asking
those questions collects answers no customer will ever search on.

Three things about the shape are load-bearing:

- **It switches on the vehicle TYPE, never on `manipulator`/`heavyEquipment`.**
  A flatbed that also carries a crane keeps the full list, because that truck
  genuinely does answer roadside calls. Same type-vs-union distinction as
  `isSpecialistVehicleType`, for the same reason — a capability must not delete
  a question the truck can still answer.
- **Payment and working conditions are pulled out of `SERVICE_CATEGORIES` by
  key, not re-listed.** Adding a payment method reaches the specialist forms
  automatically; a second copy is how «Քարտով վճարում» ends up existing for a
  flatbed and not for a manipulator.
- **Changing the type filters the driver's ticks** (`servicesAllowedFor`, called
  from `syncVehicleDependentFields`). Without it a switched-over truck keeps
  advertising «անվադողի փոխարինում» with no checkbox anywhere to untick.

The lists themselves reuse existing slugs wherever the meaning already exists —
a manipulator loading a wrecked car is offering `accident-transport`, the crane
is the method. Only the jobs the evacuator taxonomy had no word for are new
slugs: machinery and machine tools, containers and cabins, loading work sold on
its own, and the named machine classes on the transporter's list. Two slugs
meaning one thing is what this whole module exists to prevent.

### Specialist technical fields

`SPECIALIST_SPEC_FIELDS` (`frontend/constants/vehicles.ts`) is the same idea for
the numbers: one entry per question, keyed by the column it writes to, so the
form, the payload and the public profile all name the same thing.

| | «Մանիպուլյատոր» | «Ծանր տեխնիկայի էվակուատոր» |
| --- | --- | --- |
| Crane | `craneCapacityTons`, `craneReachM` | — |
| Platform | `maxLoadTons` (required) | `maxLoadTons` (required), `platformLoadHeightCm` |
| Size | `platformLengthM`/`platformWidthM` (shared with every type) | same |

Two rules worth stating:

- **`maxLoadTons` replaces the capacity band, it does not join it**
  (`usesExactCapacity`). A band is the right question for an ordinary evacuator
  — nobody knows their exact rating, and the customer only needs to know a
  saloon fits — and the wrong one for a machinery transporter, where «10
  տոննայից ավելի» is the only band that ever applies and the entire decision is
  whether a 22-tonne excavator goes on. The band is *derived* from the figure
  for storage (`capacityRangeFromTons`), and `capacityTons` is written from the
  figure rather than from `representativeCapacityTons`.
- **Platform length/width are deliberately NOT in this constant.** Every type
  already has them, via `PlatformDimensionsInput.vue`. Repeating them would be a
  second input bound to the same column.

A missing figure renders as **no row at all** on the profile, never «0 տ» — the
same call the pricing fields make, and for the same reason: a specification
table is read as a list of facts, and an invented zero is worse than an absence.

## Capacity ranges — `frontend/constants/vehicles.ts`

```ts
export const CAPACITY_RANGE_OPTIONS: CapacityRangeOption[] = [
  { value: 'up-to-2', label: 'Մինչև 2 տոննա', maxTons: 2 },
  { value: '2-3.5',   label: '2–3.5 տոննա',    minTons: 2,   maxTons: 3.5 },
  { value: '3.5-5',   label: '3.5–5 տոննա',    minTons: 3.5, maxTons: 5 },
  { value: '5-10',    label: '5–10 տոննա',     minTons: 5,   maxTons: 10 },
  { value: 'over-10', label: '10 տոննայից ավելի', minTons: 10 },
]
```

Used identically by: the registration form's capacity picker, the public
listing filter's capacity picker. One shared list, one shared component
config — editing a range here updates both.

Two different representations of "capacity" exist and matter:

- **A band slug** (`"3.5-5"`) — what a driver *picks* at registration
  (`RegistrationRequest.capacityRange: String`) and what a customer *picks* in
  the filter (`towTruckFilters` store, `capacity: string | null`).
- **An exact float** (`3.5`) — what a live `TowTruck.capacityTons: Float`
  actually stores, needed for real numeric filtering.

Two functions bridge them, both in `frontend/constants/vehicles.ts`:

- `matchesCapacityRange(capacityTons, rangeValue)` — does a truck's exact
  tonnage fall inside a customer-selected band? (min exclusive, max
  inclusive — a truck at exactly `3.5` tons matches `"2-3.5"`, not `"3.5-5"`).
  Used by `frontend/utils/towTruckFilters.ts` for the public listing filter.
- `representativeCapacityTons(rangeValue)` — turns a driver's picked band into
  one concrete number (a driver only ever picks a band, never an exact figure).
  The band's `maxTons` if it has one, else `minTons + 2` for the open-ended top
  band. Called from the admin review page's `approve()` **and** from
  `frontend/pages/dashboard.vue`'s `submit()` — a driver editing their own
  capacity must land on the same number an admin approval would produce, or a
  self-edited truck would start matching a different filter band than an
  identical approved one.

The round trip goes the other way too: the dashboard has to show the driver the
band they originally picked, not the raw float. `capacityRangeFromTons()` in
`dashboard.vue` does that with `matchesCapacityRange` — the *same* predicate the
public filter uses, so the band a driver sees in their own form is always the
band a customer would find them under.

If you ever add a new range, make sure it round-trips through both functions
sensibly (a truck approved with the new range's representative value should
immediately match that same range in the filter — this is not covered by
automated tests, verify manually).

## A note on "ask for the value, not the format"

Capacity is a picker, not a free-text tonnage. Working hours are two
`<input type="time">`, not a `"09:00 – 21:00"` box. Platform size is two number
inputs, not a `"5.5 մ × 2.2 մ"` box (`PlatformDimensionsInput.vue`).

That last one was the exception until recently, and it is worth remembering why
it changed: a field that asks a driver to produce a *format* needs a regex to
validate it, a parser to read it back, and a string column that doesn't match
the typed columns the value actually lives in — and every one of those is a
place to get it wrong. The parser was in fact missing for a long time, so the
platform dimensions were collected from every driver and displayed to nobody.

If a new field has a natural shape (a number, a date, a choice), collect it in
that shape. The separator, the unit and the punctuation are the UI's job.

## Vehicle types — `frontend/constants/vehicles.ts`

`VehicleType` enum (`flatbed`, `sliding-platform`, `manipulator`,
`heavy-duty`) with `VEHICLE_TYPE_LABELS` and `VEHICLE_TYPE_DESCRIPTIONS`.
Simpler than the above two — no band/exact split, just a flat labeled enum used
for the picker and for display. One member is not opaque to the backend, below.

### «Մանիպուլյատոր» is asked twice, and either answer counts

The registration form asks the same question in two shapes, and both are
legitimate on their own:

- **`type: 'manipulator'`** — «Մանիպուլյատորով էվակուատոր», one option of the
  required single-choice select. The natural answer when the whole truck *is* a
  manipulator, and for that driver the checkbox is a redundant second ask.
- **`manipulator: true`** — «Ունի մանիպուլյատոր», an optional equipment
  checkbox. The only way to say "my flatbed also carries a crane", which is a
  real vehicle and not a data error.

The filter read only the boolean, so a driver who answered with the type alone
was **invisible to the «Մանիպուլյատոր» filter** — exactly the customer looking
for them never saw them. The visible half of the same bug was the reverse: the
filter did return flatbeds that had ticked the box, whose cards then read
«Հարթակով էվակուատոր» and whose profile row said «Մանիպուլյատոր՝ Ոչ», because
the row read the raw boolean while the filter read… also the raw boolean, but
the card's type label came from elsewhere. Two fields, one question.

Now:

| Layer | What it does |
| --- | --- |
| `hasManipulator()` — `frontend/constants/vehicles.ts` | The union. Used by BOTH `matchesFilters` and the profile's «Մանիպուլյատոր» row, so those two can never disagree again |
| `RegistrationFormFields.vue` (registration + admin review) / `dashboard.vue` | Picking the manipulator type ticks the checkbox and **disables** it — the driver sees the answer instead of being asked twice |
| `derivesManipulator()` — `backend/src/tow-trucks/vehicle-types.ts` | The same union applied on every write (approval and dashboard save), exactly as `works24Hours` is derived from `AVAILABLE_24_7_SLUG`. A disabled checkbox is a hint; this is the boundary |

The frontend union is **not** redundant once the backend derives the column:
rows written before this existed still hold the inconsistent pair and nothing
migrated them.

Only ever widening. Changing the type away from `manipulator` does not untick
the box, because that `true` may be the driver's own answer about a flatbed
with a crane.

`MANIPULATOR_VEHICLE_TYPE` is a **manual sync point** with
`VehicleType.Manipulator`; `frontend/tests/manipulator.spec.ts` reads the
backend file as text and asserts both the slug and that both sides are a union
rather than an intersection.

### «Ծանր տեխնիկա» is the same union, decided by a moderator

`/tsanr-tehnika` works the same way — vehicle type OR a boolean:

| | «Մանիպուլյատոր» | «Ծանր տեխնիկա» |
| --- | --- | --- |
| Vehicle type | `manipulator` | `heavy-duty` |
| Boolean | `TowTruck.manipulator` | `TowTruck.heavyEquipment` |
| Who answers | the driver | the driver **proposes**, a moderator decides |
| Predicate | `derivesManipulator()` | `derivesHeavyEquipment()` |
| Applied on | every WRITE | every READ |

«Ունի մանիպուլյատոր» is a question about equipment bolted to the truck: the
driver is the only one who knows, and a wrong answer is visible in the photos.
"Can move heavy machinery" is a judgement about capacity, platform size and
experience that a driver has every incentive to answer yes to, and a wrong
answer is discovered by a stranded excavator when the truck turns up and cannot
lift it.

#### It used to be admin-only, and what changed is narrower than it looks

For a while this field was asked on neither form, and
`PATCH /admin/tow-trucks/:id/heavy-equipment` was its only writer. That was one
way to guarantee the property that actually mattered — **no driver puts
themselves on `/tsanr-tehnika`** — but it was not the property itself, and it
had a real cost: the person who knows whether the truck can lift an excavator
was never asked, so the page could only ever list drivers an admin had thought
to tick by hand.

The question is now on the registration form and the dashboard, and the
property survives intact, because **neither of those writes**:

- registration lands in the moderation queue, and approval submits the whole
  profile as the reviewer last saw it — an unticked box there means the truck
  does not appear on the page;
- a dashboard save queues a diff (`docs/api-reference.md` § "Driver edits are
  moderated"); approval runs `MyTowTruckService.applyUpdate`, the same single
  write path.

So `TowTruck.heavyEquipment` still means exactly "what a human with the whole
profile and the photos in front of them decided". A driver can **ask** for the
page; they cannot grant it. The admin endpoint stays, unchanged, for the case it
was built for: a moderator changing their mind about a live truck.

`backend/test/profile-change-diff.spec.ts` asserts the field is proposable, and
still asserts that `slug`, `phone`, `isActive` and `isFeatured` are not — the
distinction being that those have no honest "the driver asks, a human decides"
reading at all.

The admin panel ticks **and disables** the box for a `heavy-duty` truck, the
same way the registration form does for the manipulator type, and
`AdminService.setTowTruckHeavyEquipment` enforces the same rule on the write —
a disabled input is a hint to a browser, nothing more.

#### The union is applied on READ, and that is the whole safety property

`derivesManipulator` runs on every **write**, so `TowTruck.manipulator` ends up
holding the union. `heavyEquipment` is the opposite: the column stores **only
what an admin decided**, and the union is recomputed by the listing filter and
by `toAdminTowTruckSummary` each time they read. Nothing — not `approve()`, not
the admin endpoint, not the migration — ever writes the derived `true`.

That is not a style preference, it is what closes a self-promotion hole. The
two inputs have different owners: a driver may change their own `vehicleType`
from their dashboard at any time. If the union were baked into the column at
approval, a driver could register as `heavy-duty`, let it be stored as `true`,
then switch to `flatbed` — and stay on an admin-only page forever, with no
admin ever having decided anything. Deriving on read means the type's
contribution lasts exactly as long as the type does.

`backend/test/admin-heavy-equipment.spec.ts` asserts the endpoint writes
*nothing* for a `heavy-duty` truck, in both directions, which is the assertion
that would fail if someone "fixed" the apparent inconsistency between the
column and the panel.

The flag is deliberately **not** on the public card or profile — it is a page
filter, not a badge. Adding it to the card shape would publish it for every
driver at once; see CLAUDE.md § "A listing is not a profile".

`HEAVY_DUTY_VEHICLE_TYPE` is a **manual sync point** with `VehicleType.HeavyDuty`
and with the `vehicleType` of `HEAVY_DUTY_PAGE` in
`frontend/constants/vehicleTypePages.ts`, which is what sends it over the wire.

### The equipment booleans, and the three predicates that gate them

`winch`, `manipulator`, `wheelSkates` and `doubleDeck` are all driver-answered
booleans on the same column shape, but only the last two are *conditional* —
they are hidden for the vehicles the question makes no sense for, and the
answer is cleared when a type change hides them (`syncVehicleDependentFields`).
Without that clearing, an answer whose question has disappeared is invisible,
uncorrectable, and still published.

Three predicates currently exclude the same two vehicle types, and all three
are written out separately on purpose:

| Predicate | Question it answers |
| --- | --- |
| `isSpecialistVehicleType` | should this be hidden from general discovery |
| `asksWheelSkates` | does this truck load cars by rolling them |
| `asksDoubleDeck` | does this truck's deck hold more than one car |

They agree today only because of which vehicles happen to exist. A fourth type
— a low-loader, say — would be hidden from general discovery, would never touch
a skate, and could plausibly be two-tier. Collapsing them into one predicate
would make that impossible to express without untangling every caller first.

«2-հարկանի էվակուատոր» (`doubleDeck`) is also the one equipment boolean that is
**not** asked twice: there is no two-tier option in the vehicle-type select, so
unlike `manipulator` there is no second answer to union with, and every layer —
filter, profile row, card — reads the column directly. It is on the card shape
(unlike `heavyEquipment`) because it is a public filter checkbox and the
filtering runs client-side over cards.

## Geography — `frontend/data/{regions,cities,districts}.ts`

Not really a "taxonomy" in the picker sense, but the same single-source
principle applies harder here than anywhere else, because the **backend has
zero geography data of its own** (see `CLAUDE.md`). Regions, cities, and
Yerevan's 12 districts (treated as a pseudo-region — Yerevan doesn't have
"cities" in this model, its districts fill that role) are static TypeScript
arrays. Anything that needs a human-readable place name from a stored slug
must import from here or from `frontend/utils/routeHelpers.ts` /
`cityOrDistrictLabel()`-style helpers built on top of these arrays — never
invent a name from the slug string itself (e.g. title-casing it), that's how
the "service areas showing raw English slugs" bug happened (see
`docs/data-model.md`'s `TowTruck.serviceAreas` note).

`useLocationPicker()` composable (`frontend/composables/useLocationPicker.ts`)
is the reusable **single-region** cascading region → city/district select,
used by the Free Routes start/end pickers (see `docs/free-routes.md`). If you
need a single-region cascade, use this composable rather than re-implementing
the logic.

Neither `register.vue` nor `dashboard.vue` uses it — a driver there can pick up
to 2 regions (e.g. Yerevan + Kotayk), so coverage needs one city/district
checkbox group *per* selected region rather than a single cascade. That lives in
`frontend/components/common/ServiceAreaPicker.vue`, built directly on
`buildRegionOptions()`/`buildCityOptions()`, and **both pages render the exact
same component**.

That sharing is deliberate and load-bearing: registration and self-service have
to offer identical choices, or a driver can select something at sign-up that
they can never change afterwards. `MAX_REGIONS` lives there; see `CLAUDE.md`'s
"Manual sync points" for its backend counterpart.

### Landing-page-only vehicle types

`manipulator` and `heavy-duty` are listed on `/manipulator` and
`/tsanr-tehnika` — and **nowhere else**. They do not appear on a city, marz,
Yerevan or corridor listing, in the homepage's featured picks, in the
per-area «N վարորդ» counters, or in the nearest-driver search.

Why: someone browsing «Աբովյան», or pressing "find the nearest evacuator" from
the roadside, is describing an ordinary car. A truck built to lift an excavator
is not a substitute for that — it is usually further away, more expensive, and
its driver does not want the call either. The only currency this platform has
is a phone call; there is no booking flow to absorb a bad match on either side.

The list lives in `SPECIALIST_VEHICLE_TYPES`, twice — once in
`backend/src/tow-trucks/vehicle-types.ts` (the real boundary) and once in
`frontend/constants/vehicles.ts` (what mock mode filters on). Another manual
sync point; `frontend/tests/specialistVehicleTypes.spec.ts` reads the backend
file as text so the two cannot drift.

#### It excludes by the TYPE, never by the union predicates

This is the whole design, and the easy mistake is right next door:
`hasManipulator`/`derivesHeavyEquipment` are sitting there and read like the
same question.

They are not the same question.

| | asks | used by |
| --- | --- | --- |
| `derivesManipulator` / `derivesHeavyEquipment` | can this truck **also** do the specialist job? | the landing pages — which is why a flatbed with a crane belongs on `/manipulator` |
| `isSpecialistVehicleType` | is that job **all** the truck is for? | hiding one from general discovery |

So three outcomes are possible, and all three are correct:

- `vehicleType = 'manipulator'` → on `/manipulator`, and nowhere else.
- `vehicleType = 'flatbed'`, `manipulator = true` → on `/manipulator` **and**
  on every city page it covers. It is an ordinary evacuator that also carries
  a crane.
- `vehicleType = 'flatbed'`, admin-set `heavyEquipment = true` → same, for
  `/tsanr-tehnika`.

Excluding on the union instead would delete real supply from the town listings
because of one checkbox a driver ticked to describe an extra capability — and,
for `heavyEquipment`, because of a decision an admin made *about* the driver.

#### Naming a type is what lifts the exclusion

`?vehicleType=manipulator` still answers with the union. Hiding is what
*general* discovery does, and an explicit request for the type is not general
discovery. In `TowTrucksRepository.buildWhere` that is why the exclusion is the
**last** branch rather than a line at the top: the three branches above it are
exactly the ways to name a type. Hoisting it would either empty both landing
pages or need an exception carved back out for them — a rule and its own
exception in one function, which is how the «Մանիպուլյատոր» union got its
first bug.

#### Where it is applied

Five places, and each is a place to forget it:

| Where | What |
| --- | --- |
| `TowTrucksRepository.buildWhere` | every geography listing, and the sitemap's general walk |
| `TowTrucksRepository.findCoverage` | the per-area counters — they must count what the listing lists, or a «3 վարորդ» badge opens a page with two |
| `TowTrucksRepository.findFeaturedCards` | the homepage. An admin ticking `isFeatured` on a crane truck does not put it there |
| `TowTrucksRepository.findCardsByIds` | the nearest search's card fetch, stated again the way `isActive` is |
| `NearestRepository.findNearestCandidates` | inside the PostGIS query, **before** `LIMIT` — filtering after the KNN walk would silently return fewer than N drivers to someone standing next to a broken car |

Two things are deliberately **not** on that list. `GET /tow-trucks/:slug` still
serves a specialist profile — the page is real and linked. And `/admin` sees
every truck, through `findAllForAdmin`, which shares none of this.

#### Each of these types now has eleven area pages

`/manipulator/yerevan`, `/manipulator/kotayk` and so on — one per marz plus
Yerevan, and the same eleven under `/tsanr-tehnika`. They exist because
«մանիպուլյատոր Երևան» is a different query from «մանիպուլյատոր», and because
this exclusion means a city page can no longer answer either of them. See
`docs/pages-and-routes.md` § "The area pages" for the thin-page rule and the
404 behaviour, and `VEHICLE_TYPE_GEOS` for why the split is marz-level and not
per city.

An area page is the one listing on the site that asks for a specialist type by
name **and** by geography, which is exactly the `?region=&vehicleType=`
combination the backend DTO always supported and nothing used.

#### The sitemap has to walk more than one listing now

`GET /tow-trucks` is general discovery, so the sitemap's page-walk no longer
sees these trucks — and their profile pages would have quietly disappeared from
the index. `server/routes/sitemap.xml.ts` therefore walks the general listing
**plus one per `VEHICLE_TYPE_PAGE_LIST` entry**, deduped by slug (the landing
pages answer with a union, so the walks overlap on purpose). Driven by that
constant rather than a hardcoded pair, so a third landing page is announced
automatically.

#### The public filter's «Տեխնիկա» section: from the union checkbox to a plain type picker

The listing sidebar used to carry a single «Ունի մանիպուլյատոր» checkbox
(`store.manipulator`, `TowTruckFilterState.manipulator`) reading
`hasManipulator` — the union. Once both landing pages existed, that checkbox on
a city page could only ever mean "narrow to crane-equipped **flatbeds**",
because a pure `manipulator`-type truck is no longer in the array to filter in
the first place — a real but narrow question, one already answered more
directly by going to `/manipulator`. It was removed.

The section came back shaped differently: `GENERAL_LISTING_VEHICLE_TYPE_OPTIONS`
in `frontend/constants/vehicles.ts` offers **plain equality** on `flatbed` and
`sliding-platform` — the two ordinary types, matched by `vehicle.type ===
filters.vehicleType` in `matchesFilters`, no union involved, because neither of
those two is asked twice at registration the way «Մանիպուլյատոր» is.

The specialist types are excluded from the option list itself, not filtered out
of the result afterwards: `GENERAL_LISTING_VEHICLE_TYPE_OPTIONS` is
`VEHICLE_TYPE_OPTIONS` with `SPECIALIST_VEHICLE_TYPES` subtracted, so a
`manipulator`/`heavy-duty` checkbox is never offered here at all — offering one
would be a control that always returns zero results, since every truck array
this filter runs over has already had those two types removed
(`docs/taxonomies.md` § "Landing-page-only vehicle types" above). Add a third
ordinary type to `VEHICLE_TYPE_LABELS` and it appears in this filter
automatically, the same "edit one file" promise every other picker in this
codebase makes; add a third specialist type and it stays out the same way.

`hasManipulator` and the union it embodies did not go anywhere and were never
in scope here — the profile page's own «Մանիպուլյատոր» row (`TowTruckInfo.vue`)
and the landing page's mock-mode branch (`towTrucksService.getByVehicleType`)
still need it. `frontend/tests/manipulator.spec.ts` covers that predicate;
`frontend/tests/generalListingVehicleTypeFilter.spec.ts` covers this filter,
including that it can never select a specialist type.
