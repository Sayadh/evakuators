import type { DispatchPlaceType } from '~/utils/dispatchPlaces'

/** Mirrors backend `DispatchTier` — how a driver relates to the place asked for */
export type DispatchTier = 'local' | 'visiting' | 'nationwide'

/** Mirrors backend `DispatchFilter` */
export type DispatchFilter = 'all' | 'never-dispatched' | 'featured' | 'long-wait'

/** Mirrors backend `DispatchCandidateApi` */
export interface DispatchCandidate {
  id: number
  driverName: string
  companyName?: string
  phone: string
  vehicle: string
  baseName: string
  tier: DispatchTier
  isFeatured: boolean
  rating?: number
  subscriptionStatus: 'unpaid' | 'paid' | 'due-soon' | 'overdue'
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
 * Mirrors backend `DispatchCandidateByDistanceApi` — everything
 * `DispatchCandidate` has except `tier`, which has no meaning without a named
 * place to be local to, visiting, or nationwide relative to. Replaced with a
 * straight-line distance from the searched point.
 */
export interface DispatchCandidateByDistance extends Omit<DispatchCandidate, 'tier'> {
  /** Straight-line distance from the searched point, in whole metres */
  distanceMeters: number
}

/** Mirrors backend `DispatchCandidatesByCoordinatesApi` — nearest first */
export interface DispatchCandidatesByCoordinates {
  latitude: number
  longitude: number
  items: DispatchCandidateByDistance[]
}
