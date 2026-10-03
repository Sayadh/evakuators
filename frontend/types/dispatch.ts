import type { DispatchPlaceType } from '~/utils/dispatchPlaces'

/** Mirrors backend `DispatchTier` — how a driver relates to the place asked for */
export type DispatchTier = 'local' | 'visiting' | 'nationwide'

/** Mirrors backend `DispatchFilter` */
export type DispatchFilter = 'all' | 'never-dispatched' | 'featured' | 'long-wait'

/** Mirrors backend `DispatchCandidateApi` */
export interface DispatchCandidate {
  id: number
  /** Their public profile's slug — the screen links the name to it */
  slug: string
  driverName: string
  companyName?: string
  phone: string
  vehicle: string
  /** Taxonomy slug — labelled on the frontend, where the site's own names live */
  vehicleType: string
  /** Rated tonnage — printed through `capacityDisplayText`, as everywhere else */
  capacityTons: number
  /** Skates for a car whose wheels will not roll; false also means "not asked of this type" */
  wheelSkates: boolean
  baseName: string
  /**
   * Whether their listing is still published. Always true from the place and
   * coordinate searches; the driver search is the one that can answer false —
   * see the backend's own note on the field.
   */
  isActive: boolean
  tier: DispatchTier
  isFeatured: boolean
  /** "Our driver" — ranked above the rest of their tier, below a live placement */
  isPartner: boolean
  rating?: number
  subscriptionStatus: 'unpaid' | 'paid' | 'due-soon' | 'overdue'
  /** Phone-button presses on their profile over the last 30 days — see backend DISPATCH_CALLS_WINDOW_DAYS */
  callsRecent: number
  dispatchesThisMonth: number
  dispatchesTotal: number
  /** ISO datetime; absent when they have never been given a job */
  lastDispatchedAt?: string
}

export interface DispatchCandidates {
  place: { slug: string; name: string; type: DispatchPlaceType }
  items: DispatchCandidate[]
}

/**
 * Mirrors backend `DispatchCandidateBasicApi` — a candidate with no `tier`.
 *
 * `tier` answers "local, visiting or nationwide — relative to WHERE", and two
 * of the three searches have no where: coordinates have a point rather than a
 * named place, and a name search has neither. Everything else is identical,
 * which is what lets one card render all three.
 */
export type DispatchCandidateBasic = Omit<DispatchCandidate, 'tier'>

/** Mirrors backend `DispatchCandidateByDistanceApi` */
export interface DispatchCandidateByDistance extends DispatchCandidateBasic {
  /** Straight-line distance from the searched point, in whole metres */
  distanceMeters: number
}

/** Mirrors backend `DispatchCandidatesBySearchApi` */
export interface DispatchCandidatesBySearch {
  items: DispatchCandidateBasic[]
}

/** Mirrors backend `DispatchCandidatesByCoordinatesApi` — nearest first */
export interface DispatchCandidatesByCoordinates {
  latitude: number
  longitude: number
  items: DispatchCandidateByDistance[]
}
