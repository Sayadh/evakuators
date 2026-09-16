import type { TowTruckCard } from '~/types/towTruck'

/**
 * How many seeds to try before taking the last one.
 *
 * A random permutation deranges the previous one about 37% of the time (1/e),
 * so two or three tries is the usual cost. The cap sits far above that because
 * it is the difference between "usually different" and the guarantee this
 * exists to make: at 60 attempts the chance of falling through is 0.63^60.
 *
 * Each attempt is one Fisher–Yates pass over a few dozen items at most.
 */
const MAX_SEED_ATTEMPTS = 60

/** Drivers holding a paid placement — `localRank` 0 */
const PAID_RANK = 0

/**
 * Which positions could have been different at all.
 *
 * This is the correction to the first version of this file, which asked for a
 * full derangement and so asked for the impossible almost everywhere. A driver
 * can only ever move among the slots of their OWN rank — the ordering rules
 * decide the rest — so two positions are exchangeable only if their rank group
 * holds at least two drivers.
 *
 * On a town page with one local driver, slot 0 is that driver's whatever the
 * shuffle does. Demanding they leave it meant no seed ever satisfied the check,
 * all 60 attempts were spent every load, and the result was the last one tried
 * rather than a chosen one — which is how "always different" quietly became
 * "arbitrary, and often the same".
 *
 * Paid placements are excluded even when several hold one: that block is
 * ordered by purchase date, not by the shuffle. Somebody bought the position.
 */
function isMovable(
  ordered: TowTruckCard[],
  rankOf: (truck: TowTruckCard) => number,
): (index: number) => boolean {
  const groupSize = new Map<number, number>()
  for (const truck of ordered) {
    const rank = rankOf(truck)
    groupSize.set(rank, (groupSize.get(rank) ?? 0) + 1)
  }

  return (index: number): boolean => {
    const truck = ordered[index]
    if (!truck) return false
    const rank = rankOf(truck)
    if (rank === PAID_RANK) return false
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
 * No previous order at all — a first visit, a cleared cookie — is not a
 * repeat. There is nothing to repeat.
 *
 * ## Why the two lists may be different lengths, and why that is fine
 *
 * The stored list is capped (a cookie travels on every request), and the live
 * one changes whenever a driver is added, deactivated or filtered out. So the
 * comparison runs over the overlap rather than demanding the lengths match.
 *
 * Demanding it was a real bug: a town with more than the cap never had two
 * lists of equal length, so every load bailed out here and the guarantee
 * silently did nothing on exactly the busiest pages. Over the overlap, a
 * longer list is simply checked as far as the record goes — which is the part
 * anybody sees.
 */
export function repeatsAPosition(
  ordered: TowTruckCard[],
  previousIds: number[] | null,
  rankOf: (truck: TowTruckCard) => number,
): boolean {
  if (!previousIds || previousIds.length === 0) return false

  const movable = isMovable(ordered, rankOf)
  const overlap = Math.min(ordered.length, previousIds.length)
  for (let i = 0; i < overlap; i += 1) {
    if (movable(i) && ordered[i]?.id === previousIds[i]) return true
  }
  return false
}

/**
 * The first seed whose ordering leaves nobody who could move where they were.
 *
 * Runs identically on the server and in the browser — same list, same cookie,
 * same arithmetic. It is deliberately a *seed* chooser rather than a post-hoc
 * reorder: the ordering rules (placement, ours, based here) stay the single
 * source of truth for who is where, and this only picks which of the equally
 * valid shuffles inside those ranks the visitor gets.
 *
 * ## What this trades away
 *
 * Consecutive loads stop being independent: a driver who was third cannot be
 * third again next time. That is the point — it is what "always a different
 * order" means — but it is worth naming, because it means the sequence is no
 * longer uniformly random, only each individual load is.
 */
export function pickListingSeed(
  seed: number,
  previousIds: number[] | null,
  orderFor: (seed: number) => TowTruckCard[],
  rankOf: (truck: TowTruckCard) => number,
): { seed: number; ordered: TowTruckCard[] } {
  let chosen = seed
  let ordered = orderFor(chosen)

  for (let attempt = 1; attempt <= MAX_SEED_ATTEMPTS; attempt += 1) {
    if (!repeatsAPosition(ordered, previousIds, rankOf)) break
    // Derived rather than random: the browser must land on the same seed the
    // server did, and it cannot do that by rolling its own dice.
    chosen = (seed + attempt * 0x9e3779b1) >>> 0
    ordered = orderFor(chosen)
  }

  return { seed: chosen, ordered }
}
