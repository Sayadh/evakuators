/**
 * The SQL twin of `fleet/domain/availability.ts` + `orders/domain/requirements.ts`.
 *
 * Used twice: to build a candidate batch, and again INSIDE the transaction that
 * creates an offer — "free when the list was built" is not "free now".
 * `test-live/eligibility-parity.integration.test.ts` evaluates this predicate
 * and the TypeScript functions over the same rows; they must agree.
 *
 * Aliases: t = "FleetDriverProfile" (one shape for both kinds of driver), p = "DriverPresence", lc = "DriverLocationCurrent".
 * Everything is compared with the DATABASE clock.
 */
import type { Params } from '../platform/params'
import type { DispatchSettings } from '../platform/settings'
import { TRACKING_CONSENT_VERSION } from '../fleet/domain/availability'
import { capabilitySqlPredicate, needsLockedWheelEquipment, type OrderRequirements } from '../orders/domain/requirements'

/** Which position a driver is matched by — see `availabilityPredicate` */
export type LocationSource = 'GPS' | 'BASE'

/**
 * `GPS` (the normal rule, and the ONLY one for anything a customer sees): a
 * fresh, accurate, not-suspicious live fix.
 *
 * `BASE` (dispatch fallback, product decision 2026-11): everything else the
 * same — online, app CONNECTED (fresh heartbeat), not busy — but the live fix
 * is stale, inaccurate, suspicious or missing, and the driver has a base
 * location to be measured from instead. Requires `eligibleFrom('BASE')`
 * (a driver who never sent a fix has no "DriverLocationCurrent" row).
 *
 * Connection for `BASE`: a fresh heartbeat, OR one within
 * `baseHeartbeatMaxAgeSeconds` when the phone can still be rung — a live push
 * token on a live session. Switching GPS off (or locking the phone) also stops
 * the background heartbeat, which rides on location updates; without this the
 * fallback would never reach the very drivers it exists for. The offer itself
 * still has to be confirmed as delivered (`offerDeliverySeconds`), so a phone
 * that is really gone costs one short delivery window, not an order.
 */
export function availabilityPredicate(p: Params, settings: DispatchSettings, source: LocationSource = 'GPS'): string {
  const gpsUsable = `(
    lc."measuredAt" >= now() - make_interval(secs => ${p.add(settings.gpsMaxAgeSeconds)}::int)
    AND lc."accuracyM" <= ${p.add(settings.gpsMaxAccuracyMeters)}::real
    AND lc."suspicious" = false
  )`
  const position =
    source === 'GPS'
      ? gpsUsable
      : `(t."baseLatitude" IS NOT NULL AND t."baseLongitude" IS NOT NULL AND (lc."driverId" IS NULL OR NOT ${gpsUsable}))`
  const freshHeartbeat = `p."lastHeartbeatAt" >= now() - make_interval(secs => ${p.add(settings.heartbeatMaxAgeSeconds)}::int)`
  const connection =
    source === 'GPS'
      ? freshHeartbeat
      : `(${freshHeartbeat} OR (
          p."lastHeartbeatAt" >= now() - make_interval(secs => ${p.add(settings.baseHeartbeatMaxAgeSeconds)}::int)
          AND EXISTS (
            SELECT 1 FROM "PushDeviceToken" pt
              JOIN "DriverDeviceSession" s ON s."id" = pt."sessionId" AND s."revokedAt" IS NULL
             WHERE pt."driverId" = t."id" AND pt."invalidatedAt" IS NULL
          )
        ))`
  return `(
    t."isActive" = true
    AND (p."dispatchSuspendedAt" IS NULL OR p."dispatchSuspendedUntil" <= now())
    AND COALESCE(p."trackingConsentVersion", 0) >= ${p.add(TRACKING_CONSENT_VERSION)}::int
    AND p."wantsOnline" = true
    AND ${connection}
    AND ${position}
    AND p."externalBusy" = false
    AND NOT EXISTS (SELECT 1 FROM "OrderOffer" x WHERE x."driverId" = t."id" AND x."status" = 'PENDING')
    AND NOT EXISTS (SELECT 1 FROM "OrderAssignment" y WHERE y."driverId" = t."id" AND y."endedAt" IS NULL)
  )`
}

export function capabilityPredicate(p: Params, requirements: OrderRequirements): string {
  return capabilitySqlPredicate(
    p.add(requirements.vehicleWeightKg),
    p.add(requirements.needsManipulator === true),
    p.add(needsLockedWheelEquipment(requirements)),
    p.add(requirements.needsWheelSkates === true),
  )
}

export const ELIGIBLE_FROM = `
  "FleetDriverProfile" t
  JOIN "DriverPresence" p ON p."driverId" = t."id"
  JOIN "DriverLocationCurrent" lc ON lc."driverId" = t."id"`

/** The FROM clause matching `availabilityPredicate(…, source)` */
export function eligibleFrom(source: LocationSource): string {
  return source === 'GPS' ? ELIGIBLE_FROM : ELIGIBLE_FROM.replace('JOIN "DriverLocationCurrent"', 'LEFT JOIN "DriverLocationCurrent"')
}
