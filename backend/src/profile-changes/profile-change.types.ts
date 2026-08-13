/**
 * One field that differs, as the panel and the dashboard both read it.
 *
 * `before`/`after` are carried as raw JSON values rather than as formatted
 * strings, for the same reason every other slug in this codebase reaches the
 * client raw: the words for a service, a city or a vehicle type live in the
 * frontend's static data and the backend has none of them (CLAUDE.md). Turning
 * `flatbed` into «Հարթակով էվակուատոր» here would mean teaching the API a
 * taxonomy it deliberately does not know.
 */
export interface ProfileChangeFieldApi {
  field: string
  before: unknown
  after: unknown
}

/** A queued edit, as the moderation panel lists it */
export interface ProfileChangeApi {
  id: number
  towTruckId: number
  towTruckSlug: string
  driverName: string
  companyName?: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  /** Only what differs — the whole point of the queue. Never the full profile. */
  fields: ProfileChangeFieldApi[]
  rejectionReason?: string
  createdAt: string
  reviewedAt?: string
}

/**
 * What the driver's own dashboard needs to know.
 *
 * Two mutually exclusive halves: something is waiting, or the last thing that
 * was waiting got a verdict. Never both — a driver who has resubmitted is
 * looking at the new attempt, and showing the previous refusal beside it would
 * read as a verdict on the edit currently in the queue.
 */
export interface DriverProfileChangeStatusApi {
  pending: {
    id: number
    fields: ProfileChangeFieldApi[]
    createdAt: string
  } | null
  lastReviewed: {
    id: number
    status: 'APPROVED' | 'REJECTED'
    rejectionReason?: string
    reviewedAt?: string
  } | null
}
