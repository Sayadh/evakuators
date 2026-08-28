/**
 * What actually changed between a driver's submitted form and their live
 * profile.
 *
 * ## Why the diff, and not the whole form
 *
 * The dashboard is a full form: it loads every field, and pressing save sends
 * every field, whether or not the driver touched it. Queuing that verbatim
 * would give a moderator thirty lines to read for a corrected phone number, and
 * approving it would rewrite thirty columns to the values they already held —
 * so an edit could "change" a field that had been altered by an admin in the
 * meantime, just by being submitted from a stale form.
 *
 * Keeping only the differences makes the review a diff (which is the whole
 * point of the queue) and makes an approval touch exactly the columns the
 * driver meant to touch.
 *
 * ## An empty diff is a real answer
 *
 * A driver who opens the form and saves without editing anything produces `{}`.
 * That is not an error and it must not create a request: an empty queue entry
 * would ask a moderator to approve nothing, and rejecting it would be
 * meaningless. Callers check for it.
 */

/** The value shapes a profile field can hold on the wire */
export type ProfileFieldValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly unknown[]

export type ProfileChanges = Record<string, unknown>

/**
 * The keys the diff is allowed to contain, and nothing else.
 *
 * An allow-list rather than "whatever the DTO happened to carry", because the
 * diff is written to a `Json` column and later spread into a Prisma update: a
 * key that is not a real column would turn every approval into an
 * unknown-argument error, and a key that IS a column but should not be
 * driver-editable (`slug`, `phone`, `isActive`, `isFeatured`, `heavyEquipment`)
 * would be a privilege escalation with a moderator's own click behind it.
 *
 * `regionSlugs` is on the list but is never stored — it exists to tell the
 * coverage cap one marz from two (see UpdateMyTowTruckDto) and the apply step
 * strips it, exactly as the direct-write path used to.
 */
export const EDITABLE_PROFILE_FIELDS = [
  'driverName',
  'companyName',
  'secondaryPhone',
  'whatsapp',
  'telegram',
  'vehicleBrand',
  'vehicleModel',
  'vehicleYear',
  'vehicleType',
  'capacityTons',
  'platformLengthM',
  'platformWidthM',
  'craneCapacityTons',
  'craneReachM',
  'maxLoadTons',
  'platformLoadHeightCm',
  'winch',
  'manipulator',
  'wheelSkates',
  'doubleDeck',
  // Proposable, not self-granted: this list is an allow-list for a diff a
  // MODERATOR approves, so putting «Ծանր տեխնիկայի տեղափոխում» on it is what
  // lets a driver ask for /tsanr-tehnika without being able to put themselves
  // there. See backend/src/tow-trucks/vehicle-types.ts for why that
  // distinction is the whole point of the flag.
  'heavyEquipment',
  'servesAllArmenia',
  'description',
  'services',
  'workingHoursText',
  'locationName',
  'serviceAreas',
  'regionSlugs',
  'regionSlug',
  'citySlug',
  'districtSlug',
  'priceCityCallout',
  'pricePerKm',
  'priceWaitingPerHour',
  'priceNightSurchargePercent',
  'priceExtraLoading',
  'imageIds',
  'latitude',
  'longitude',
] as const

export type EditableProfileField = (typeof EDITABLE_PROFILE_FIELDS)[number]

const EDITABLE = new Set<string>(EDITABLE_PROFILE_FIELDS)

/**
 * Fields whose value is only ever *submitted*, never compared.
 *
 * `regionSlugs` is not stored anywhere, so there is no "current" value to
 * compare it against — and it must ride along whenever `serviceAreas` changes,
 * because the coverage cap needs it. Including it in the comparison would drop
 * it from every diff and leave the cap guessing.
 */
export const ALWAYS_CARRIED_FIELDS = new Set<string>(['regionSlugs'])

const ALWAYS_CARRIED = ALWAYS_CARRIED_FIELDS

/**
 * Fields that must ride along with a change to another field, even when they
 * did not change themselves.
 *
 * ## The bug this exists for
 *
 * `MyTowTruckService.applyUpdate` treats coverage as **one decision, not four
 * fields**: the JSON list the public profile renders and the
 * `citySlug`/`districtSlug`/`regionSlug` the browsing pages filter on have to
 * describe the same geography, so it refuses a `serviceAreas` update that does
 * not also say where the truck is based, and it writes
 * `citySlug: rest.citySlug ?? null` — a placement field that is merely absent
 * is not left alone, it is actively nulled.
 *
 * The dashboard sends all four together for exactly that reason. A driver
 * adding one city while keeping the same base changes only `serviceAreas`, so a
 * diff that kept strictly what differed dropped the placement — and every such
 * edit became **permanently unapprovable**, failing with a message about a
 * field the driver had in fact sent. It is the commonest coverage edit there
 * is.
 *
 * Carried fields are applied but not *displayed*: they never get a `before`
 * entry, and the review UI shows only fields that have one. So a moderator
 * still sees one line («Սպասարկվող տարածքներ»), not four.
 */
const CARRY_WITH: Record<string, readonly string[]> = {
  serviceAreas: ['citySlug', 'districtSlug', 'regionSlug'],
}

/**
 * Compares like with like across the shapes these values arrive in.
 *
 * Arrays are compared **in order**: `serviceAreas` and `imageIds` are ordered
 * lists (coverage display order, gallery order), so a reorder is a real change
 * a driver may well have meant.
 *
 * Objects inside them are compared **key by key, ignoring key order** — and
 * that is not a refinement, it is the whole point.
 *
 * ## Why not `JSON.stringify`
 *
 * It was `JSON.stringify` on both sides, which is exact for two objects built
 * in the same order and wrong for these. `TowTruck.serviceAreas` is a Postgres
 * **`jsonb`** column, and jsonb does not preserve key order: it stores keys
 * sorted by length and then bytewise. `{slug, name, type}` goes in and
 * `{name, slug, type}` comes back out, forever.
 *
 * So the stored value and the value the dashboard rebuilds — which are the same
 * coverage, field for field — produced different JSON text, `isSame` said
 * "changed", and **every single driver save queued a phantom coverage change**:
 * a moderator saw «Սևան, Գավառ, Մարտունի» → «Սևան, Գավառ, Մարտունի» and had
 * nothing to approve. It also meant a driver could never save anything without
 * dragging their whole coverage list through review with it.
 *
 * `backend/test/profile-change-jsonb.spec.ts` proves the round trip against a
 * real Postgres, because nothing short of one can see this.
 *
 * ## The two value rules that were already here, and still are
 *
 * Empty string and null are **equal**: the form renders a null as an empty box,
 * so a driver who never touched a clearable contact field submits `''` against
 * a stored `null`. Numbers are compared by value, because the DTO sends numbers
 * while Prisma can return a Decimal.
 */
function isSame(a: unknown, b: unknown): boolean {
  if (a === b) return true

  const aEmpty = a === null || a === undefined || a === ''
  const bEmpty = b === null || b === undefined || b === ''
  if (aEmpty && bEmpty) return true
  if (aEmpty !== bEmpty) return false

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => isSame(item, b[index]))
  }
  // One array and one not — a shape change, and never equal.
  if (Array.isArray(a) !== Array.isArray(b)) return false

  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = definedKeys(a)
    const bKeys = definedKeys(b)
    if (aKeys.length !== bKeys.length) return false
    // Sorted, so the comparison cannot depend on the order the keys happen to
    // be in — which is exactly what jsonb changes underneath us.
    return aKeys.every((key, index) => key === bKeys[index] && isSame(a[key], b[key]))
  }

  // Numbers arrive as numbers from the DTO and can come back from Prisma as
  // Decimal or as a string for the coordinate pair — compare by value once both
  // sides are primitives.
  if (typeof a === 'number' || typeof b === 'number') {
    return Number(a) === Number(b)
  }

  return false
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * An object's keys, sorted, with `undefined` values dropped.
 *
 * `undefined` is dropped because `JSON.stringify` drops it too, so a DTO
 * instance carrying an unset optional property must still equal the stored
 * object that simply does not have that key.
 */
function definedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
}

export interface ProfileDiff {
  /**
   * What an approval **applies**: the keys that differ, plus the context those
   * keys need to be applicable at all (see `ALWAYS_CARRIED_FIELDS` and
   * `CARRY_WITH`).
   */
  changes: ProfileChanges
  /**
   * What a moderator **reads**: the keys that genuinely differ, as they were.
   *
   * This is the narrower of the two, and the difference is load-bearing rather
   * than incidental — `before` is the definition of "a real change". A carried
   * field has no entry here, so the review UI can render exactly the driver's
   * edit by iterating this rather than `changes`, and the two can never come
   * apart the way two hand-maintained lists would.
   */
  before: ProfileChanges
}

/**
 * @param submitted the driver's PATCH body, already validated by the DTO
 * @param current the live profile, keyed the same way
 */
export function diffProfile(
  submitted: Record<string, unknown>,
  current: Record<string, unknown>,
): ProfileDiff {
  const changes: ProfileChanges = {}
  const before: ProfileChanges = {}

  for (const [key, value] of Object.entries(submitted)) {
    if (value === undefined) continue
    // Anything outside the allow-list is dropped silently rather than rejected:
    // a client sending an unknown key is a client bug, not an attack the driver
    // can see a message about, and `forbidNonWhitelisted` on the DTO has
    // already refused the ones that matter before this is reached.
    if (!EDITABLE.has(key)) continue

    if (ALWAYS_CARRIED.has(key)) {
      changes[key] = value
      continue
    }

    if (isSame(value, current[key])) continue

    changes[key] = value
    // Only here. `before` is the definition of "a real change" — see ProfileDiff.
    before[key] = current[key] ?? null
  }

  // Nothing genuinely differed, so there is nothing to review. Measured on
  // `before`, not `changes`: the carried keys below have no `before` entry, so
  // a driver re-saving an untouched coverage section cannot queue a request
  // whose entire content is context.
  if (Object.keys(before).length === 0) return { changes: {}, before: {} }

  // Context the apply step needs. Added AFTER the loop so it cannot itself
  // count as a change and cannot be overwritten by one: a field that really did
  // change is already in `changes` with the submitted value, and re-reading it
  // from `submitted` here would write the same value again.
  for (const [trigger, companions] of Object.entries(CARRY_WITH)) {
    if (!(trigger in changes)) continue
    for (const companion of companions) {
      if (companion in changes) continue
      if (!EDITABLE.has(companion)) continue
      // `?? null` rather than skipping an absent key: `applyUpdate` nulls a
      // placement field it is not given, so "the driver has no districtSlug"
      // has to be said out loud rather than left to a default.
      changes[companion] = submitted[companion] ?? current[companion] ?? null
    }
  }

  return { changes, before }
}

/**
 * Whether a diff is worth queueing.
 *
 * Reads `before`, which holds only genuine changes — `changes` additionally
 * carries context (the marz list, the base placement) that is meaningless to
 * review on its own. See `ProfileDiff`.
 */
export function isEmptyDiff(diff: ProfileDiff): boolean {
  return Object.keys(diff.before).length === 0
}
