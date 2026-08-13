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
  'email',
  'vehicleBrand',
  'vehicleModel',
  'vehicleYear',
  'vehicleType',
  'capacityTons',
  'platformLengthM',
  'platformWidthM',
  'winch',
  'manipulator',
  'wheelSkates',
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
 * Compares like with like across the shapes these values arrive in.
 *
 * Arrays are compared **in order**: `serviceAreas` and `imageIds` are ordered
 * lists (coverage display order, gallery order), so a reorder is a real change
 * a driver may well have meant. Objects inside them are compared by their JSON
 * text rather than key-by-key, which is exact for the two shapes that occur
 * here (`{slug,name,type}`) and cheap.
 *
 * Empty string and null are treated as **equal**, because they mean the same
 * thing for every clearable contact field: the form renders a null as an empty
 * box, so a driver who never touched it submits `''` against a stored `null`.
 * Reading that as a change would put a phantom line in front of a moderator on
 * every single save.
 */
function isSame(a: unknown, b: unknown): boolean {
  if (a === b) return true

  const aEmpty = a === null || a === undefined || a === ''
  const bEmpty = b === null || b === undefined || b === ''
  if (aEmpty && bEmpty) return true
  if (aEmpty !== bEmpty) return false

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && JSON.stringify(a) === JSON.stringify(b)
  }

  // Numbers arrive as numbers from the DTO and can come back from Prisma as
  // Decimal or as a string for the coordinate pair — compare by value once both
  // sides are primitives.
  if (typeof a === 'number' || typeof b === 'number') {
    return Number(a) === Number(b)
  }

  return false
}

export interface ProfileDiff {
  /** Only the keys that differ — the thing a moderator reads and an approval applies */
  changes: ProfileChanges
  /** The same keys as they were, for rendering «was → now» without a second query */
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
    before[key] = current[key] ?? null
  }

  // A diff that carries only the always-carried keys is not a change. Without
  // this, a driver re-saving an untouched coverage section would queue a
  // request whose entire content is the marz list the cap needs.
  const hasRealChange = Object.keys(changes).some((key) => !ALWAYS_CARRIED.has(key))
  if (!hasRealChange) return { changes: {}, before: {} }

  return { changes, before }
}

/** Whether a diff is worth queueing — see the note above about an empty save */
export function isEmptyDiff(diff: ProfileDiff): boolean {
  return Object.keys(diff.changes).length === 0
}
