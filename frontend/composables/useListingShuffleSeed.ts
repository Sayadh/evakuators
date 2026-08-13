/**
 * The one random number the listings are ordered by, for this page load.
 *
 * ## Why a seed exists at all
 *
 * Inside a town, drivers are shown in a random order rather than by rating —
 * see `sortTowTrucks` for why. Randomness in a server-rendered page cannot come
 * from `Math.random()` at render time: the server would produce one order and
 * the browser another, and hydration would either force-patch the DOM or show a
 * visible reshuffle a moment after the page appears.
 *
 * `useState` is exactly the tool for this. Its value is created **once**, on the
 * server, and serialised into the Nuxt payload — so the browser reads the same
 * number rather than inventing its own, and every ordering derived from it
 * matches.
 *
 * ## What "per page load" means, precisely
 *
 * A full page load (or a hard refresh) runs SSR again, mints a new seed, and
 * reorders everything. Client-side navigation within the same session keeps the
 * seed, so walking from one town's page to another and back does not reshuffle
 * under the visitor — which is the behaviour someone comparing two listings
 * expects, and is why this is app-wide state rather than a per-page ref.
 *
 * A driver refreshing their own town's page will see themselves move. That is
 * the feature, not a glitch: it is what "everyone gets the top of the list
 * sometimes" looks like from the inside.
 */
export function useListingShuffleSeed(): number {
  // 32-bit, because that is what the PRNG's state is — see `seededShuffle`.
  // `useState`'s initialiser runs on whichever side reaches it first, which for
  // any real page is the server.
  return useState<number>('listing-shuffle-seed', () =>
    Math.floor(Math.random() * 0xffffffff),
  ).value
}
