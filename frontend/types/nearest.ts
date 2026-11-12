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

/**
 * `POST /nearest-tow-trucks/live` — ONE list, same shape as the existing
 * search plus a `live` mark. A website driver who is online in the driver app
 * with a fresh GPS fix is measured from where their phone is now (`live`);
 * everyone else from the parking spot in their profile. A driver appears once.
 * Live entries carry no coordinates; distance is rounded to 100 m and time to
 * the minute. App-only drivers (not on the website) never appear here.
 */
export interface LiveNearestTowTruck extends NearestTowTruck {
  live?: { freshness: 'UNDER_1_MIN' | 'UNDER_2_MIN' }
}

export interface LiveNearbyResult {
  results: LiveNearestTowTruck[]
  routed: boolean
  liveCount: number
  computedAt: string
  disclaimer: 'NOT_A_RESERVATION'
}
