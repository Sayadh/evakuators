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
  band. Called from `frontend/pages/admin.vue`'s `submitApprove()` **and** from
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
| `register.vue` / `dashboard.vue` | Picking the manipulator type ticks the checkbox and **disables** it — the driver sees the answer instead of being asked twice |
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

### «Ծանր տեխնիկա» is the same union with a different author

`/tsanr-tehnika` works the same way — vehicle type OR a boolean — but the
boolean is **set by an admin, never by the driver**. There is no registration
field and no dashboard field for it, and that asymmetry is the point:

| | «Մանիպուլյատոր» | «Ծանր տեխնիկա» |
| --- | --- | --- |
| Vehicle type | `manipulator` | `heavy-duty` |
| Boolean | `TowTruck.manipulator` | `TowTruck.heavyEquipment` |
| Who sets the boolean | the driver, at registration | **an admin**, in `/admin` |
| Predicate | `derivesManipulator()` | `derivesHeavyEquipment()` |
| Endpoint | (part of the normal write path) | `PATCH /admin/tow-trucks/:id/heavy-equipment` |

«Ունի մանիպուլյատոր» is a question about equipment bolted to the truck: the
driver is the only one who knows, and a wrong answer is visible in the photos.
"Can move heavy machinery" is a judgement about capacity, platform size and
experience that a driver has every incentive to answer yes to, and a wrong
answer is discovered by a stranded excavator when the truck turns up and
cannot lift it. So it is not the driver's to make — which is also why it is
one of the very few fields exempt from CLAUDE.md's "registration and the
dashboard must offer the same fields" rule: it is asked in neither.

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
