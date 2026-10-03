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
   * The taxonomy slug — `flatbed`, `sliding-platform`, `manipulator`,
   * `heavy-duty`. Sent raw rather than as a label: the labels live in the
   * frontend's `constants/vehicles.ts` and are the same strings the public
   * site, the filters and the registration form use. A second set of Armenian
   * names written on the backend is a second set to keep in step.
   */
  vehicleType: string
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
  /**
   * Whether their listing is still published.
   *
   * Always `true` from the place and coordinate searches, which only ever look
   * at published drivers. The driver search is the one that can return `false`:
   * it finds anybody by name, and somebody ringing to ask about a job they were
   * referred last week is exactly the driver who may have been deactivated
   * since. A card that looked ordinary there would be the screen hiding the
   * reason the call is happening.
   */
  isActive: boolean
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

/**
 * A candidate with no `tier`.
 *
 * `tier` answers "local, visiting, or nationwide — relative to WHERE", and two
 * of the three searches have no where: coordinates have a point rather than a
 * named place, and a name search has neither. Everything else a card shows is
 * identical, which is the point — one card, three ways in.
 */
export type DispatchCandidateBasicApi = Omit<DispatchCandidateApi, 'tier'>

/** The screen's answer for a name, company name or phone */
export interface DispatchCandidatesBySearchApi {
  items: DispatchCandidateBasicApi[]
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
export interface DispatchCandidateByDistanceApi extends DispatchCandidateBasicApi {
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
