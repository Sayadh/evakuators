import type { TowTruckCardApi } from './tow-truck.types'

/**
 * Who stands where on a city or district listing — decided here, on the
 * server, and sent down already in that order.
 *
 * ## Why the server owns this
 *
 * The order used to be decided in the browser's render, from a seed minted
 * during SSR. That produced the right picture, but it meant the API's answer
 * was not the listing: anything reading `/tow-trucks?city=…` directly — a
 * second client, a cache, a future paginated query that can only `LIMIT` what
 * the database has already sorted — got whatever `findManyCards` happened to
 * return. The order is a property of the listing, so it is computed where the
 * listing is.
 *
 * ## The ranks
 *
 * Lower first. Ranks 1, 2 and 4 are shuffled; ranks 0 and 3 are queues.
 *
 * 0. a live paid placement — either product — AND based here. Last refresh
 *    first, NOT shuffled. Somebody bought that position; "sometimes the top"
 *    is not what they bought.
 * 1. our own drivers (`isPartner`) whose BASE is this place;
 * 2. everyone else based here;
 * 3. a live «Ամբողջ սպասարկման տարածքում» placement on a page the driver
 *    explicitly covers without being based in it — a queue, like rank 0;
 * 4. everyone else — the drivers who cover this place without being based in it.
 *
 * Being based here is the OUTER split; being ours sorts inside it. Someone
 * searching a town is choosing among that town's drivers, and a driver an hour
 * away is an hour away whoever they are.
 *
 * ## Why rating plays no part
 *
 * It did, and it made one fixed queue per town: a smoothed rating separates
 * drivers by hundredths, so the same two or three profiles sat on top forever
 * and everyone below them was never called, so never reviewed, so never moved.
 * On a marketplace with a few drivers per town that is not a ranking, it is a
 * monopoly. Inside a town the order is a shuffle, and every driver gets the top
 * of the list some of the time.
 */
export interface ListingPlace {
  citySlug?: string
  districtSlug?: string
}

/** Drivers holding a paid placement in their own town — never shuffled */
const PAID_RANK = 0

/** Drivers holding the area placement on a page they cover — never shuffled */
const AREA_PAID_RANK = 3

/** Ranks ordered by last refresh instead of by the shuffle */
function isQueueRank(rank: number): boolean {
  return rank === PAID_RANK || rank === AREA_PAID_RANK
}

/**
 * How many seeds to try before taking the last one.
 *
 * A random permutation deranges the previous one about 37% of the time (1/e),
 * so two or three tries is the usual cost. The cap sits far above that because
 * it is the difference between "usually different" and the guarantee this
 * exists to make: at 60 attempts the chance of falling through is 0.63^60.
 */
const MAX_SEED_ATTEMPTS = 60

/** mulberry32 — deterministic, uniform enough for ordering a list */
function createRandom(seed: number): () => number {
  // >>> 0 keeps the state an unsigned 32-bit integer, which is what the
  // algorithm's constants assume. A negative or fractional seed still works.
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A new array in a shuffled order, reproducible for a given seed.
 *
 * Fisher–Yates, which is the version that is actually uniform — the
 * `sort(() => Math.random() - 0.5)` idiom is not, and additionally hands the
 * engine an inconsistent comparator, whose result the spec does not define.
 *
 * Reproducible matters even though only this process ever shuffles: the
 * `avoid` loop below has to be able to try a seed, look at what it produced,
 * and use that exact order.
 */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items]
  const random = createRandom(seed)

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j] as T, result[i] as T]
  }

  return result
}

/**
 * Whether this driver's own base is the place being listed — i.e. they work
 * here, not merely *also* here.
 *
 * Compared against the structural placement, never against `serviceAreas`:
 * every driver in this response already serves the place, so matching on
 * coverage would make it true for all of them and separate nobody.
 */
function isBasedAt(truck: TowTruckCardApi, place: ListingPlace): boolean {
  if (place.citySlug) return truck.location.citySlug === place.citySlug
  if (place.districtSlug) return truck.location.districtSlug === place.districtSlug
  return false
}

/**
 * Is this driver holding a paid top placement **on this page**?
 *
 * The `&& isBasedAt` is the entire product decision, not a guard. The top of a
 * page is sold only to the drivers based on it — the page where somebody
 * standing next to a broken car in that town is choosing. A driver who merely
 * covers this town cannot buy their way above the drivers based in it, by
 * either product; the area product buys rank 3, after them.
 *
 * `promotedAt` is present only while a placement is live, and is set by both
 * products — see the mapper.
 */
function isPromotedAt(truck: TowTruckCardApi, place: ListingPlace): boolean {
  return truck.promotedAt !== undefined && isBasedAt(truck, place)
}

/**
 * Does this driver's own coverage list name the place being listed?
 *
 * Explicitly, by slug — not "appears on this page". A page also carries drivers
 * who reach it some other way (a corridor, a nationwide specialist), and the
 * area product sells the towns the driver CHOSE, which the coverage cap keeps
 * to a handful. Reading presence instead would let `servesAllArmenia` turn one
 * purchase into the second slot of every town in the country.
 */
function coversExplicitly(truck: TowTruckCardApi, place: ListingPlace): boolean {
  if (place.citySlug) {
    return truck.serviceAreas.some((area) => area.type === 'city' && area.slug === place.citySlug)
  }
  if (place.districtSlug) {
    return truck.serviceAreas.some(
      (area) => area.type === 'district' && area.slug === place.districtSlug,
    )
  }
  return false
}

/**
 * Is this driver holding the area placement on this page, as a visitor?
 *
 * After the local drivers, never above them: someone standing in this town is
 * choosing among this town's drivers first, and that promise is not for sale.
 * What is sold is the first place among everyone who comes from elsewhere.
 */
function isAreaPromotedAt(truck: TowTruckCardApi, place: ListingPlace): boolean {
  return truck.promotedInArea === true && !isBasedAt(truck, place) && coversExplicitly(truck, place)
}

/** Which group this driver falls in, on a listing about `place`. Lower first. */
export function listingRank(truck: TowTruckCardApi, place: ListingPlace): number {
  const basedHere = isBasedAt(truck, place)

  if (isPromotedAt(truck, place)) return PAID_RANK
  if (basedHere && truck.isPartner) return 1
  if (basedHere) return 2
  if (isAreaPromotedAt(truck, place)) return AREA_PAID_RANK
  return 4
}

/**
 * One listing, in the order it should be read, for one seed.
 *
 * Shuffle first, then a STABLE sort by rank: the sort settles which group a
 * driver is in, and the shuffle — which the stable sort preserves inside each
 * group — settles where they are within it. Doing it the other way round would
 * need the comparator to know about the shuffle.
 */
export function orderListing(
  trucks: readonly TowTruckCardApi[],
  place: ListingPlace,
  seed: number,
): TowTruckCardApi[] {
  return seededShuffle(trucks, seed).sort((a, b) => {
    const byRank = listingRank(a, place) - listingRank(b, place)
    if (byRank !== 0) return byRank

    // Everyone outside the two paid ranks keeps the shuffle's own order.
    if (!isQueueRank(listingRank(a, place))) return 0

    // The paid queues: last refresh (or purchase) first, so the driver who
    // pressed «Թարմացնել» most recently is on top and the others move down by
    // one rather than being displaced. Plain string comparison, not
    // `localeCompare` — these are ISO timestamps, where lexical order IS
    // chronological order.
    const left = a.promotedAt ?? ''
    const right = b.promotedAt ?? ''
    if (left === right) return 0
    return left > right ? -1 : 1
  })
}

/**
 * Which positions could have been different at all.
 *
 * A driver can only ever move among the slots of their OWN rank — the ranks
 * decide the rest — so two positions are exchangeable only if their rank group
 * holds at least two drivers. On a town page with one local driver, slot 0 is
 * that driver's whatever the shuffle does; demanding they leave it would mean
 * no seed ever satisfies the check, all 60 attempts are spent, and the result
 * is the last one tried rather than a chosen one — which is how "always
 * different" quietly becomes "arbitrary, and often the same".
 *
 * Paid placements are excluded even when several hold one: those blocks are
 * ordered by last refresh, not by the shuffle.
 */
function movableAt(
  ordered: readonly TowTruckCardApi[],
  place: ListingPlace,
): (index: number) => boolean {
  const groupSize = new Map<number, number>()
  for (const truck of ordered) {
    const rank = listingRank(truck, place)
    groupSize.set(rank, (groupSize.get(rank) ?? 0) + 1)
  }

  return (index: number): boolean => {
    const truck = ordered[index]
    if (!truck) return false
    const rank = listingRank(truck, place)
    if (isQueueRank(rank)) return false
    return (groupSize.get(rank) ?? 0) > 1
  }
}

/**
 * Does anybody who COULD have moved still stand exactly where they stood?
 *
 * Position by position, not "is the list the same": the complaint this answers
 * is a driver seeing themselves in the same slot twice running, which a
 * whole-list comparison would call "different" as long as somebody else moved.
 *
 * The two lists may be different lengths — the caller's record is capped and
 * the live list changes whenever a driver is added, deactivated or filtered
 * out — so the comparison runs over the overlap rather than demanding they
 * match. Demanding it was a real bug: a town with more drivers than the cap
 * never had two lists of equal length, so the guarantee silently did nothing
 * on exactly the busiest pages.
 */
function repeatsAPosition(
  ordered: readonly TowTruckCardApi[],
  previousIds: readonly number[],
  place: ListingPlace,
): boolean {
  if (previousIds.length === 0) return false

  const movable = movableAt(ordered, place)
  const overlap = Math.min(ordered.length, previousIds.length)
  for (let i = 0; i < overlap; i += 1) {
    if (movable(i) && ordered[i]?.id === previousIds[i]) return true
  }
  return false
}

/**
 * The listing, in the first order that leaves nobody who could move where the
 * caller last saw them.
 *
 * `avoid` is the order this visitor was shown last time, sent back by the
 * client that remembered it. Without it this is one shuffle; with it,
 * consecutive loads stop being independent — a driver who was third cannot be
 * third again. That is the point, and it is worth naming: the SEQUENCE is no
 * longer uniformly random, only each individual load is.
 *
 * A first visit has nothing to avoid, and is not a repeat. It is still
 * shuffled: the seed the caller minted is a fresh random number per request,
 * which is what makes two visitors arriving at the same town at the same
 * moment see different drivers first.
 */
export function pickListingOrder(
  trucks: readonly TowTruckCardApi[],
  place: ListingPlace,
  seed: number,
  avoid: readonly number[] = [],
): TowTruckCardApi[] {
  let ordered = orderListing(trucks, place, seed)

  for (let attempt = 1; attempt <= MAX_SEED_ATTEMPTS; attempt += 1) {
    if (!repeatsAPosition(ordered, avoid, place)) break
    // Derived rather than random: an attempt that is itself random would make
    // the loop untestable, and the golden-ratio step walks the seed space
    // without ever revisiting a seed within one call.
    ordered = orderListing(trucks, place, (seed + attempt * 0x9e3779b1) >>> 0)
  }

  return ordered
}
