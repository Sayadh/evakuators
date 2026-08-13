/**
 * A shuffle that two JavaScript runtimes agree on.
 *
 * ## Why not `Math.random()`
 *
 * The listings are server-rendered. `Math.random()` inside a render produces
 * one order on the server and a different one in the browser, and Vue then
 * finds the hydrated DOM does not match what it was told to expect — the same
 * class of bug `docs/architecture.md` documents for runtime-localised strings,
 * with the same symptom: a silent force-patch of the DOM, or a visible reshuffle
 * a moment after the page appears.
 *
 * So the randomness is *seeded*, and the seed is decided once per page load and
 * carried across in the Nuxt payload (see `useListingShuffleSeed`). Server and
 * client run the same permutation; the next full page load runs a different one.
 *
 * ## Why a hand-rolled PRNG
 *
 * `Math.random()` cannot be seeded, and this needs perhaps twenty numbers per
 * page — a dependency would be all cost. mulberry32 is a well-known 32-bit
 * generator that is a handful of lines, deterministic, and far better
 * distributed than the `sin`-based one-liners that circulate for this job (those
 * visibly favour some positions, which on a marketplace listing would mean a
 * driver who is quietly always near the top).
 */

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
 * Never mutates its input: the callers are Vue computeds over reactive arrays,
 * and shuffling in place would mutate the store's own data on every render.
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
