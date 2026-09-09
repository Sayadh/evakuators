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
