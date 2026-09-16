import type { TowTruckCard } from '~/types/towTruck'

/**
 * How many seeds to try before giving up and taking the last one.
 *
 * A random permutation is a derangement of the previous one about 37% of the
 * time (1/e), so two or three tries is the usual cost. The cap is set far
 * above that because it is the difference between "usually different" and the
 * guarantee this exists to make: at 60 attempts the chance of falling through
 * is 0.63^60, about one in a trillion page loads. Twelve was tried first and
 * failed roughly one seed in two hundred — often enough that a driver would
 * have seen it.
 *
 * Each attempt is one Fisher-Yates pass over a list of a few dozen at most, so
 * the cap costs nothing; it is there for the case where no derangement can
 * exist — a one-driver town — not to bound a slow loop.
 */
const MAX_SEED_ATTEMPTS = 60

/**
 * Drivers whose position is not the shuffle's to change.
 *
 * A paid placement is ordered by purchase date and sits at the top of the
 * list; somebody bought that position, so "always show a different order"
 * must not reach it. They occupy the first `pinnedCount` slots and are
 * excluded from the comparison below.
 */
export function pinnedCount(ordered: TowTruckCard[]): number {
  let count = 0
  while (count < ordered.length && ordered[count]?.promotedAt !== undefined) count += 1
  return count
}

/**
 * Does anybody still stand exactly where they stood last time?
 *
 * Position-by-position, not "is the list the same": the complaint this answers
 * is a driver seeing themselves in the same slot on two consecutive loads,
 * which a whole-list comparison would call "different" as long as anyone else
 * moved.
 *
 * An unknown previous order (first visit, cleared cookie, a driver added or
 * removed since) is not a repeat — there is nothing to repeat.
 */
export function repeatsAPosition(
  ordered: TowTruckCard[],
  previousIds: number[] | null,
  skip: number,
): boolean {
  if (!previousIds || previousIds.length !== ordered.length) return false

  for (let i = skip; i < ordered.length; i += 1) {
    if (ordered[i]?.id === previousIds[i]) return true
  }
  return false
}

/**
 * The first seed whose ordering leaves nobody where they were.
 *
 * Runs identically on the server and in the browser — same list, same cookie,
 * same arithmetic — which is what keeps it hydration-safe. It is deliberately
 * a *seed* chooser rather than a post-hoc reorder: the ordering rules
 * (placement, ours, based here) stay the single source of truth for who is
 * where, and this only picks which of the equally valid shuffles inside those
 * ranks the visitor gets.
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
): { seed: number; ordered: TowTruckCard[] } {
  let chosen = seed
  let ordered = orderFor(chosen)
  const skip = pinnedCount(ordered)

  for (let attempt = 1; attempt <= MAX_SEED_ATTEMPTS; attempt += 1) {
    if (!repeatsAPosition(ordered, previousIds, skip)) break
    // Derived rather than random: the browser must land on the same seed the
    // server did, and it cannot do that by rolling its own dice.
    chosen = (seed + attempt * 0x9e3779b1) >>> 0
    ordered = orderFor(chosen)
  }

  return { seed: chosen, ordered }
}
