/**
 * The SQL twin of `fleet/domain/availability.ts` + `orders/domain/requirements.ts`.
 *
 * Used twice: to build a candidate batch, and again INSIDE the transaction that
 * creates an offer — "free when the list was built" is not "free now".
 * `test-live/eligibility-parity.integration.test.ts` evaluates this predicate
 * and the TypeScript functions over the same rows; they must agree.
 *
 * Aliases: t = "TowTruck", p = "DriverPresence", lc = "DriverLocationCurrent".
 * Everything is compared with the DATABASE clock.
 */
import type { Params } from '../platform/params'
import type { DispatchSettings } from '../platform/settings'
import { TRACKING_CONSENT_VERSION } from '../fleet/domain/availability'
import { capabilitySqlPredicate, needsLockedWheelEquipment, type OrderRequirements } from '../orders/domain/requirements'

export function availabilityPredicate(p: Params, settings: DispatchSettings): string {
  return `(
    t."isActive" = true
    AND p."dispatchSuspendedAt" IS NULL
    AND COALESCE(p."trackingConsentVersion", 0) >= ${p.add(TRACKING_CONSENT_VERSION)}::int
    AND p."wantsOnline" = true
    AND p."lastHeartbeatAt" >= now() - make_interval(secs => ${p.add(settings.heartbeatMaxAgeSeconds)}::int)
    AND lc."measuredAt" >= now() - make_interval(secs => ${p.add(settings.gpsMaxAgeSeconds)}::int)
    AND lc."accuracyM" <= ${p.add(settings.gpsMaxAccuracyMeters)}::real
    AND lc."suspicious" = false
    AND p."externalBusy" = false
    AND NOT EXISTS (SELECT 1 FROM "OrderOffer" x WHERE x."towTruckId" = t."id" AND x."status" = 'PENDING')
    AND NOT EXISTS (SELECT 1 FROM "OrderAssignment" y WHERE y."towTruckId" = t."id" AND y."endedAt" IS NULL)
  )`
}

export function capabilityPredicate(p: Params, requirements: OrderRequirements): string {
  return capabilitySqlPredicate(
    p.add(requirements.vehicleWeightKg),
    p.add(requirements.needsManipulator === true),
    p.add(needsLockedWheelEquipment(requirements)),
  )
}

export const ELIGIBLE_FROM = `
  "TowTruck" t
  JOIN "DriverPresence" p ON p."towTruckId" = t."id"
  JOIN "DriverLocationCurrent" lc ON lc."towTruckId" = t."id"`
