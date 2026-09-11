import type { DispatchLocationType, DispatchTier } from './dispatch-ranking'

/** One driver as the dispatch screen shows them */
export interface DispatchCandidateApi {
  id: number
  driverName: string
  companyName?: string
  /** The number the dispatcher dials — the driver's own login phone */
  phone: string
  vehicle: string
  /** Where they are based, in words, for the "comes from elsewhere" rows */
  baseName: string
  tier: DispatchTier
  isFeatured: boolean
  /** Confirmed-review average; undefined when nobody has rated them */
  rating?: number
  /** Whether their subscription is currently clear — shown, never filtered on (see DispatchService) */
  subscriptionStatus: 'unpaid' | 'paid' | 'due-soon' | 'overdue'

  /** Jobs handed to them in the current calendar month */
  dispatchesThisMonth: number
  /** Jobs handed to them ever */
  dispatchesTotal: number
  /** ISO datetime of the last one, undefined when they have never had any */
  lastDispatchedAt?: string
}

/** The screen's answer for one searched place */
export interface DispatchCandidatesApi {
  place: { slug: string; name: string; type: DispatchLocationType }
  items: DispatchCandidateApi[]
}

/**
 * One driver as the coordinate search shows them — everything
 * `DispatchCandidateApi` shows except `tier`, which has no meaning without a
 * named place to be local to, visiting, or nationwide relative to; a straight
 * distance replaces it instead.
 */
export interface DispatchCandidateByDistanceApi extends Omit<DispatchCandidateApi, 'tier'> {
  /** Straight-line distance from the searched point, in whole metres */
  distanceMeters: number
}

/** The screen's answer for a searched point, nearest first */
export interface DispatchCandidatesByCoordinatesApi {
  latitude: number
  longitude: number
  items: DispatchCandidateByDistanceApi[]
}

/** What a recorded referral answers back with */
export interface DispatchReferralApi {
  id: number
  towTruckId: number
  driverName: string
  locationName: string
  createdAt: string
}
