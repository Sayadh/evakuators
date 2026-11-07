/**
 * Whether a driver may receive a NEW offer right now — and, just as
 * important, WHY NOT, in words an operator and the driver can act on.
 *
 * Six independent facts, never one `online` boolean:
 *
 * | Fact | Source | Question |
 * | --- | --- | --- |
 * | admin       | TowTruck.isActive, DriverPresence.dispatchSuspendedAt | Is this driver allowed to work at all? |
 * | preference  | DriverPresence.wantsOnline | Did the driver say "send me jobs"? |
 * | connection  | DriverPresence.lastHeartbeatAt | Is the app actually alive? |
 * | gps         | DriverLocationCurrent | Do we know where they are, recently and precisely enough? |
 * | occupancy   | OrderOffer (PENDING), OrderAssignment (active), externalBusy | Are they free? |
 * | consent     | DriverPresence.trackingConsentVersion | Did they agree to tracking? |
 *
 * This TypeScript function is what the admin console and the app display. The
 * dispatch engine filters with the SQL twin in `dispatching/eligibility-sql.ts`;
 * `test-live/eligibility-parity.test.ts` runs both against the same rows so
 * the two cannot silently disagree.
 */
import type { DispatchSettings } from '../../platform/settings'

export const TRACKING_CONSENT_VERSION = 1

export interface AvailabilityInput {
  isActive: boolean
  dispatchSuspendedAt: Date | null
  wantsOnline: boolean
  lastHeartbeatAt: Date | null
  trackingConsentVersion: number | null
  location: { measuredAt: Date; accuracyM: number; suspicious: boolean } | null
  externalBusy: boolean
  hasPendingOffer: boolean
  hasActiveAssignment: boolean
}

export type AdminState = 'APPROVED' | 'SUSPENDED' | 'INACTIVE'
export type ConnectionState = 'FRESH' | 'STALE' | 'NEVER'
export type GpsState = 'FRESH' | 'STALE' | 'INACCURATE' | 'SUSPICIOUS' | 'NONE'
export type OccupancyState = 'FREE' | 'RESERVED' | 'ON_ORDER' | 'EXTERNAL_BUSY'

export type IneligibleReason =
  | 'INACTIVE'
  | 'SUSPENDED'
  | 'NO_TRACKING_CONSENT'
  | 'OFFLINE_BY_CHOICE'
  | 'CONNECTION_STALE'
  | 'GPS_MISSING'
  | 'GPS_STALE'
  | 'GPS_INACCURATE'
  | 'GPS_SUSPICIOUS'
  | 'RESERVED'
  | 'ON_ORDER'
  | 'EXTERNAL_BUSY'

export interface Availability {
  eligible: boolean
  reasons: IneligibleReason[]
  admin: AdminState
  preference: 'ONLINE' | 'OFFLINE'
  connection: ConnectionState
  gps: GpsState
  occupancy: OccupancyState
  gpsAgeSeconds: number | null
  heartbeatAgeSeconds: number | null
}

export type AvailabilityRules = Pick<
  DispatchSettings,
  'gpsMaxAgeSeconds' | 'gpsMaxAccuracyMeters' | 'heartbeatMaxAgeSeconds'
>

export function computeAvailability(input: AvailabilityInput, now: Date, rules: AvailabilityRules): Availability {
  const reasons: IneligibleReason[] = []

  const admin: AdminState = !input.isActive ? 'INACTIVE' : input.dispatchSuspendedAt ? 'SUSPENDED' : 'APPROVED'
  if (admin === 'INACTIVE') reasons.push('INACTIVE')
  if (admin === 'SUSPENDED') reasons.push('SUSPENDED')

  if (input.trackingConsentVersion === null || input.trackingConsentVersion < TRACKING_CONSENT_VERSION) {
    reasons.push('NO_TRACKING_CONSENT')
  }

  const preference = input.wantsOnline ? 'ONLINE' : 'OFFLINE'
  if (!input.wantsOnline) reasons.push('OFFLINE_BY_CHOICE')

  const heartbeatAgeSeconds = input.lastHeartbeatAt
    ? Math.max(0, (now.getTime() - input.lastHeartbeatAt.getTime()) / 1000)
    : null
  const connection: ConnectionState =
    heartbeatAgeSeconds === null ? 'NEVER' : heartbeatAgeSeconds <= rules.heartbeatMaxAgeSeconds ? 'FRESH' : 'STALE'
  if (connection !== 'FRESH') reasons.push('CONNECTION_STALE')

  // Deliberately independent of the heartbeat: a fresh heartbeat with an old
  // fix is an app that is alive but cannot see the sky — not a known position.
  const gpsAgeSeconds = input.location
    ? Math.max(0, (now.getTime() - input.location.measuredAt.getTime()) / 1000)
    : null
  let gps: GpsState
  if (!input.location || gpsAgeSeconds === null) gps = 'NONE'
  else if (gpsAgeSeconds > rules.gpsMaxAgeSeconds) gps = 'STALE'
  else if (input.location.accuracyM > rules.gpsMaxAccuracyMeters) gps = 'INACCURATE'
  else if (input.location.suspicious) gps = 'SUSPICIOUS'
  else gps = 'FRESH'
  const gpsReason: Record<Exclude<GpsState, 'FRESH'>, IneligibleReason> = {
    NONE: 'GPS_MISSING',
    STALE: 'GPS_STALE',
    INACCURATE: 'GPS_INACCURATE',
    SUSPICIOUS: 'GPS_SUSPICIOUS',
  }
  if (gps !== 'FRESH') reasons.push(gpsReason[gps])

  // Most specific first: an assignment outranks a reservation outranks the
  // driver's own "busy elsewhere" flag.
  const occupancy: OccupancyState = input.hasActiveAssignment
    ? 'ON_ORDER'
    : input.hasPendingOffer
      ? 'RESERVED'
      : input.externalBusy
        ? 'EXTERNAL_BUSY'
        : 'FREE'
  if (input.hasActiveAssignment) reasons.push('ON_ORDER')
  if (input.hasPendingOffer) reasons.push('RESERVED')
  if (input.externalBusy) reasons.push('EXTERNAL_BUSY')

  return {
    eligible: reasons.length === 0,
    reasons,
    admin,
    preference,
    connection,
    gps,
    occupancy,
    gpsAgeSeconds: gpsAgeSeconds === null ? null : Math.round(gpsAgeSeconds),
    heartbeatAgeSeconds: heartbeatAgeSeconds === null ? null : Math.round(heartbeatAgeSeconds),
  }
}

/**
 * Reasons a MANUAL offer from an operator may override, with an audited
 * reason — the operator may have just spoken to the driver on the phone.
 * Everything that protects an assignment (busy, reserved, inactive,
 * suspended) can never be overridden.
 */
export const MANUAL_OVERRIDABLE: readonly IneligibleReason[] = [
  'OFFLINE_BY_CHOICE',
  'CONNECTION_STALE',
  'GPS_MISSING',
  'GPS_STALE',
  'GPS_INACCURATE',
  'GPS_SUSPICIOUS',
  'EXTERNAL_BUSY',
]
