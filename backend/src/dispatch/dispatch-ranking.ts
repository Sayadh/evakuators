/**
 * Who to offer a job to, and in what order — the whole decision, as plain
 * functions over plain values.
 *
 * Kept DI-free and database-free for the reason every rule in this codebase
 * is: it is the part a person will argue with ("why was he above me?"), so it
 * has to be readable on its own and testable without a database.
 */

/** `LocationType` as it appears in `serviceAreas` and on the truck's own columns */
export type DispatchLocationType = 'city' | 'district' | 'region'

/** The place the CALLER named, resolved from the static taxonomy */
export interface DispatchPlace {
  slug: string
  name: string
  type: DispatchLocationType
}

/**
 * How a driver relates to the place that was asked for.
 *
 * ## Why three, and why in this order
 *
 * A driver BASED in the place is a different offer from one who merely
 * declared they would travel there, and both are different from one who
 * declared the whole country. The dispatcher knows this and asks for it: show
 * me the local ones first, then the ones who come from elsewhere.
 *
 * The distinction costs nothing to compute, because the data already draws
 * it. `districtSlug`/`citySlug`/`regionSlug` is where the driver IS
 * ("where are you based"); `serviceAreas` is where they GO ("who can help in
 * this city"); `servesAllArmenia` is the deliberate single flag that replaced
 * "ticked all eleven marzes". Nothing new is stored to tell them apart.
 */
export type DispatchTier = 'local' | 'visiting' | 'nationwide'

export const DISPATCH_TIERS: readonly DispatchTier[] = ['local', 'visiting', 'nationwide']

/** Everything the tiering needs from a truck — a shape, not the Prisma row */
export interface DispatchCandidateInput {
  regionSlug: string | null
  citySlug: string | null
  districtSlug: string | null
  servesAllArmenia: boolean
  serviceAreas: Array<{ slug: string; type: string }>
}

/** Is the place this driver's own base? */
function isBasedIn(truck: DispatchCandidateInput, place: DispatchPlace): boolean {
  switch (place.type) {
    case 'district':
      return truck.districtSlug === place.slug
    case 'city':
      return truck.citySlug === place.slug
    case 'region':
      return truck.regionSlug === place.slug
    default:
      return false
  }
}

/** Did this driver name the place among the areas they serve? */
function declaresArea(truck: DispatchCandidateInput, place: DispatchPlace): boolean {
  return truck.serviceAreas.some((area) => area.slug === place.slug && area.type === place.type)
}

/**
 * Which tier this driver falls in for this place, or `null` when the place is
 * nothing to do with them and they should not appear at all.
 *
 * `local` wins over `visiting` even when the driver also declared the area
 * explicitly — being based there is the stronger fact, and a driver who both
 * lives in Abovyan and lists it should not be read as merely willing to drive
 * out.
 */
export function dispatchTier(
  truck: DispatchCandidateInput,
  place: DispatchPlace,
): DispatchTier | null {
  if (isBasedIn(truck, place)) return 'local'
  if (declaresArea(truck, place)) return 'visiting'
  if (truck.servesAllArmenia) return 'nationwide'
  return null
}

/** What the list shows and sorts on, once the referral log has been read */
export interface RankedCandidate {
  tier: DispatchTier
  /** Admin-marked "one of the good ones" — `TowTruck.isFeatured` */
  isFeatured: boolean
  /** Confirmed-review average, or null when nobody has rated them */
  rating: number | null
  driverName: string
}

const TIER_ORDER: Record<DispatchTier, number> = { local: 0, visiting: 1, nationwide: 2 }

/**
 * The order inside the screen: tier, then the drivers the operator marked as
 * good, then rating.
 *
 * ## Why "who has waited longest" is NOT the sort
 *
 * It was the obvious candidate, and it is deliberately not used. The operator
 * asked for the waiting time as a COLUMN and for two filters over it, which is
 * a different thing: they want to see fairness and choose to act on it, not
 * have it decided for them. Sorting by it would also make the "has not
 * received any yet" filter meaningless, since those drivers would already be
 * pinned to the top.
 *
 * The person on the phone knows things this ordering cannot — who is awake,
 * who is reliable, who upset a customer last week. The list's job is to put
 * the plausible names in front of them quickly, not to pick for them.
 *
 * An unrated driver sorts below a rated one rather than above: no reviews is
 * not evidence of quality, and a brand-new profile should not outrank someone
 * with a record.
 */
export function compareCandidates(a: RankedCandidate, b: RankedCandidate): number {
  const byTier = TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
  if (byTier !== 0) return byTier

  if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1

  const ratingA = a.rating ?? -1
  const ratingB = b.rating ?? -1
  if (ratingA !== ratingB) return ratingB - ratingA

  // Stable and predictable when everything else ties, so the list does not
  // reshuffle between two calls about the same place.
  return a.driverName.localeCompare(b.driverName, 'hy')
}

/** The four choices in the screen's one dropdown */
export type DispatchFilter = 'all' | 'never-dispatched' | 'featured' | 'long-wait'

export const DISPATCH_FILTERS: readonly DispatchFilter[] = [
  'all',
  'never-dispatched',
  'featured',
  'long-wait',
]

/**
 * What counts as "has been waiting a long time".
 *
 * A month, because that is the billing cycle: a driver who paid for a month
 * and was handed nothing in it is exactly the person the operator needs
 * surfaced before the renewal conversation happens, not after.
 */
export const DISPATCH_LONG_WAIT_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Whether a candidate survives the chosen filter.
 *
 * `never-dispatched` and `long-wait` deliberately do not overlap: a driver who
 * has never been given anything is not "waiting 30 days", they are a separate
 * and more urgent case, and merging them would hide the smaller list inside
 * the larger one.
 */
export function matchesDispatchFilter(
  candidate: { isFeatured: boolean; lastDispatchedAt: Date | null; dispatchCount: number },
  filter: DispatchFilter,
  now: Date = new Date(),
): boolean {
  switch (filter) {
    case 'never-dispatched':
      return candidate.dispatchCount === 0
    case 'featured':
      return candidate.isFeatured
    case 'long-wait':
      if (candidate.lastDispatchedAt === null) return false
      return now.getTime() - candidate.lastDispatchedAt.getTime() >= DISPATCH_LONG_WAIT_DAYS * DAY_MS
    default:
      return true
  }
}
