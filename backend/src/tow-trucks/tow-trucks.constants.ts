/**
 * Limits for the public tow truck listing.
 *
 * `GET /tow-trucks` returns a bare array with no pagination envelope, and the
 * frontend filters (services, capacity, 24/7, manipulator) run client-side over
 * the whole result. That is a deliberate trade-off for a country-sized dataset:
 * a single Armenian city has dozens of tow trucks, not thousands, and
 * server-side pagination would force every filter to move to the backend too
 * (you cannot paginate on the server and filter on the client — you would be
 * filtering within one page and silently hiding matches on the others).
 *
 * The cap below exists so that stays a trade-off rather than a vulnerability:
 * an unfiltered `GET /tow-trucks` from a scraper can never make the database
 * serialise the entire fleet in one response.
 *
 * `TowTrucksService.list()` logs a warning when a response actually hits the
 * cap — that is the tripwire that says "this assumption has expired, move
 * filtering and pagination to the backend".
 */
export const TOW_TRUCK_LIST_DEFAULT_LIMIT = 200
export const TOW_TRUCK_LIST_MAX_LIMIT = 200

/** Page size for admin listings, which DO grow without bound (see AdminController) */
export const ADMIN_LIST_DEFAULT_LIMIT = 50
export const ADMIN_LIST_MAX_LIMIT = 200
