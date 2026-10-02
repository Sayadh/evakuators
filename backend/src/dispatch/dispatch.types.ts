import type { DispatchLocationType, DispatchTier } from './dispatch-ranking'

/** One driver as the dispatch screen shows them */
export interface DispatchCandidateApi {
  id: number
  /** Their public profile's slug, so the screen can link to it */
  slug: string
  driverName: string
  companyName?: string
  /** The number the dispatcher dials — the driver's own login phone */
  phone: string
  vehicle: string
  /**
   * Rated platform tonnage, as the band the driver registered under — the
   * frontend prints it through `capacityDisplayText`, the same function the
   * public profile uses, so a dispatcher and a customer read one figure.
   */
  capacityTons: number
  /**
   * Skates for a car whose wheels will not roll. Only some vehicle types are
   * ever asked (see `asksWheelSkates`), so `false` means "not this truck",
   * never "we did not ask" — which is why the card shows it only when true.
   */
  wheelSkates: boolean
  /** Where they are based, in words, for the "comes from elsewhere" rows */
  baseName: string
  tier: DispatchTier
  isFeatured: boolean
  /** "Our driver" — ranked above the rest of their tier, below a live placement */
  isPartner: boolean
  /** Confirmed-review average; undefined when nobody has rated them */
  rating?: number
  /** Whether their subscription is currently clear — shown, never filtered on (see DispatchService) */
  subscriptionStatus: 'unpaid' | 'paid' | 'due-soon' | 'overdue'

  /**
   * Phone-button presses on their public profile over the last
   * `DISPATCH_CALLS_WINDOW_DAYS` days.
   *
   * A rolling window rather than the calendar month on purpose: on the 2nd of
   * a month a calendar figure is near zero for everybody and ranks nobody,
   * while this one means the same thing on every day it is read.
   */
  callsRecent: number
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
