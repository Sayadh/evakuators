# Taxonomies — the single-source-of-truth constants pattern

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
- `representativeCapacityTons(rangeValue)` — turns a driver's registration
  band into one concrete number when an admin approves the request (a driver
  only ever picks a band, never an exact figure — the admin approve flow used
  to also ask for an exact number redundantly; that was removed, this
  function now derives it automatically: the band's `maxTons` if it has one,
  else `minTons + 2` for the open-ended top band). Called from
  `frontend/pages/admin.vue`'s `submitApprove()`.

If you ever add a new range, make sure it round-trips through both functions
sensibly (a truck approved with the new range's representative value should
immediately match that same range in the filter — this is not covered by
automated tests, verify manually).

## Vehicle types — `frontend/constants/vehicles.ts`

`VehicleType` enum (`flatbed`, `sliding-platform`, `manipulator`,
`heavy-duty`) with `VEHICLE_TYPE_LABELS` and `VEHICLE_TYPE_DESCRIPTIONS`.
Simpler than the above two — no band/exact split, no backend cross-reference,
just a flat labeled enum used for the vehicle-type picker and display.

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
is the reusable cascading region → city/district select, built once for
`register.vue` and reused for the Free Routes start/end pickers (see
`docs/free-routes.md`). If you need another region/city cascading picker
anywhere, use this composable rather than re-implementing the cascade logic.
