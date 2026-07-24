/**
 * The one service slug the backend cares about structurally (everything else
 * in the `services` string[] is opaque to the backend — labels/categories
 * live entirely in the frontend, see frontend/constants/services.ts).
 *
 * `works24Hours` used to be a separately-edited boolean. It's now derived
 * from whether this slug is present in `services`, so there's a single
 * source of truth (the checkbox) while the DB keeps a real boolean column
 * for cheap sorting/filtering (`ORDER BY works24Hours DESC`).
 *
 * MUST match the ServiceType.Available247 value in
 * frontend/types/enums.ts exactly — nothing enforces that at compile time
 * since the two apps don't share code, so if you ever rename one, rename both.
 */
export const AVAILABLE_24_7_SLUG = 'available-24-7'
