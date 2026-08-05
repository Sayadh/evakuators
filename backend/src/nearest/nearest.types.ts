import type { TowTruckCardApi } from '../tow-trucks/tow-truck.types'

/**
 * A candidate straight off the PostGIS query: the card columns plus the
 * spheroid distance Postgres computed while it was ordering them.
 */
export interface NearestCandidateRow {
  id: number
  /** Metres, straight line on the WGS84 spheroid — computed by PostGIS, not by us */
  straightLineMeters: number
  latitude: number
  longitude: number
}

/**
 * One result, as the frontend receives it.
 *
 * The tow truck is the **existing card shape**, unchanged — the /evakuator page
 * renders it with the very same `TowTruckCard` component every listing uses, so
 * the call button and its analytics come along for free rather than being
 * reimplemented (and forgotten) on a new page.
 *
 * The three distance fields are additive and independent of it.
 */
export interface NearestTowTruckApi {
  towTruck: TowTruckCardApi
  /**
   * Straight-line metres. **Always present.** This is what the page falls back
   * to when the routing service is unavailable, so it is never optional.
   */
  straightLineMeters: number
  /**
   * Road metres from the driver's stated base to the visitor. Absent when the
   * matrix service failed, was not configured, or had no route — in which case
   * the frontend shows the straight-line figure and no time at all.
   */
  roadMeters?: number
  /**
   * Estimated driving seconds. Absent exactly when `roadMeters` is: a duration
   * cannot be derived from a straight line without inventing an average speed,
   * and an invented arrival time is worse than no arrival time.
   */
  durationSeconds?: number
}

export interface NearestSearchApi {
  results: NearestTowTruckApi[]
  /**
   * Whether the road figures above are real.
   *
   * Sent as one flag for the whole response rather than left to be inferred
   * per-result, because the copy on the page differs wholesale: routed results
   * say «Ճանապարհով», the fallback says «Ուղիղ գծով» and explains why. A page
   * that had to guess from the presence of a key would end up doing it
   * inconsistently.
   */
  routed: boolean
}
