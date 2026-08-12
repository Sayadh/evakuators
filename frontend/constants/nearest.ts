/**
 * The visitor-facing rules for «Գտնել մոտակա էվակուատորները».
 *
 * Both numbers below exist to stop one person costing the platform a metered
 * routing request every time they reopen the page — but they are *product*
 * rules with visible copy attached, not the backend's real protection. That is
 * `NEAREST_ORS_DAILY_QUOTA` in `backend/src/nearest/nearest.constants.ts`, one
 * global budget for the whole platform.
 *
 * Neither of these is a security boundary. Anything kept in a browser can be
 * cleared, and incognito starts fresh — that is fine and expected. They shape
 * the behaviour of the overwhelming majority who never try, while the global
 * budget handles whatever any one browser claims.
 */

/**
 * How long one search's answer keeps being shown without asking again.
 *
 * An hour, because the thing being answered barely changes inside one: a
 * driver's stated parking spot is where they said they park, and the set of
 * drivers covering a neighbourhood does not turn over between 14:00 and 15:00.
 * A visitor pressing the button again inside the hour gets the same list
 * instantly, with no geolocation prompt and no request — which is also why the
 * cached copy is worth keeping across a page reload rather than living in
 * memory.
 */
export const NEAREST_RESULT_CACHE_TTL_MS = 60 * 60 * 1000

/**
 * **Detailed** searches one person may run in an Armenia calendar day — the
 * ones that come back with road distances and driving times.
 *
 * ## This does not limit searching, only road data
 *
 * Spending it never turns the page into a dead end. Past this number the page
 * goes on searching, unlimited, asking the backend for straight-line distances
 * only (`skipRouting`): the visitor still gets the complete ranked list of the
 * drivers nearest them, just measured «Ուղիղ գծով» with no times. Only the
 * expensive half — one call against a metered external quota — is rationed;
 * the PostGIS half is a single indexed query and rationing it would save
 * nothing while costing someone standing next to a broken car everything.
 *
 * Counts searches that actually bought road data — a press served from the
 * cache above costs nothing, and neither does one where the visitor refused
 * the location prompt, the request failed, or the answer was straight-line
 * only. So "2" means two detailed answers, not two button presses.
 *
 * Resets at midnight Yerevan time, not on a rolling 24 hours, so that «վաղը»
 * in the copy is literally true.
 */
export const NEAREST_DAILY_SEARCH_LIMIT = 2

/**
 * `localStorage` keys. Namespaced like the analytics visitor id
 * (`evakuators:visitor-id`) so everything this site stores is greppable and
 * removable as a group.
 *
 * **Only results and a counter are ever written — never coordinates.** The
 * page's own doc comment and `docs/nearest-search.md` both promise the
 * visitor's position is not stored, and caching the *answer* rather than the
 * question is what keeps that true: serving a cached list needs the list, not
 * the place it was computed from.
 */
export const NEAREST_CACHE_STORAGE_KEY = 'evakuators:nearest-result'
export const NEAREST_QUOTA_STORAGE_KEY = 'evakuators:nearest-quota'
