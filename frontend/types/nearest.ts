import type { TowTruckCard } from './towTruck'

/**
 * One result of the "nearest evacuator" search — mirrors the backend's
 * `NearestTowTruckApi`.
 *
 * The driver is the **ordinary card shape**, deliberately unchanged. The
 * /evakuator page renders it with the same `TowTruckCard` component every
 * listing on the site uses, so the call button and the analytics behind it come
 * along by construction rather than being reimplemented on a new page and
 * quietly left untracked.
 */
export interface NearestTowTruck {
  towTruck: TowTruckCard
  /**
   * Straight-line metres. Always present — it is what the page shows when road
   * data is unavailable, so it can never be the thing that is missing.
   */
  straightLineMeters: number
  /**
   * Road metres from the driver's stated base location. Absent when the routing
   * service could not answer for this driver.
   */
  roadMeters?: number
  /**
   * Driving seconds. Absent exactly when `roadMeters` is — a time cannot be
   * derived from a straight line without inventing an average speed, and an
   * invented arrival time is worse than none.
   */
  durationSeconds?: number
}

export interface NearestSearchResult {
  results: NearestTowTruck[]
  /**
   * Whether the road figures are real for this response.
   *
   * One flag for the whole list rather than a per-result check, because the
   * copy changes wholesale: «Ճանապարհով» when true, «Ուղիղ գծով» plus an
   * explanation when false.
   */
  routed: boolean
}
