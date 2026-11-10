/**
 * Phase one of candidate selection: who is plausible, nearest first, from OUR
 * database — availability, freshness, capability, and geography.
 *
 * Production uses PostGIS: `ST_DWithin` on the GiST-indexed generated
 * `DriverLocationCurrent.location`, ordered by the `<->` KNN operator, bounded
 * by LIMIT — the same shape as `NearestRepository` (docs/nearest-search.md).
 *
 * `source: 'GPS'` (the normal case) uses only the live fix. `source: 'BASE'`
 * is the fallback (product decision, 2026-11) the engine reaches only after
 * every radius found no driver with a usable fix: connected drivers whose GPS
 * is stale or missing, measured from their base location (the website
 * profile's parking for SITE_LINKED, the app sign-up's optional base for
 * APP_ONLY). No spatial index on that point — the fallback set is small (it
 * is already filtered to online, connected, idle drivers).
 */
import { Params, toDate, toNullableDate, toNumber } from '../platform/params'
import type { DispatchSettings } from '../platform/settings'
import type { Sql } from '../platform/sql'
import type { OrderRequirements } from '../orders/domain/requirements'
import { availabilityPredicate, capabilityPredicate, eligibleFrom, type LocationSource } from './eligibility-sql'

export interface FoundCandidate {
  driverId: number
  straightLineMeters: number
  latitude: number
  longitude: number
  availableSince: Date | null
  measuredAt: Date
  source: LocationSource
}

export interface CandidateQuery {
  pickup: { latitude: number; longitude: number }
  radiusMeters: number
  limit: number
  requirements: OrderRequirements
  /** Drivers already considered in this attempt */
  excludeAttemptId: number | null
  /** Live fix (default) or the base-location fallback */
  source?: LocationSource
}

/** Where a candidate is, per source — SQL expressions over t (profile) and lc (live fix) */
function position(source: LocationSource): { lat: string; lng: string; point: string; measuredAt: string } {
  if (source === 'GPS') return { lat: 'lc."latitude"', lng: 'lc."longitude"', point: 'lc."location"', measuredAt: 'lc."measuredAt"' }
  return {
    lat: 't."baseLatitude"',
    lng: 't."baseLongitude"',
    point: 'ST_SetSRID(ST_MakePoint(t."baseLongitude"::double precision, t."baseLatitude"::double precision), 4326)::geography',
    measuredAt: 'COALESCE(lc."measuredAt", now())',
  }
}

export interface CandidateFinder {
  find(db: Sql, query: CandidateQuery, settings: DispatchSettings): Promise<FoundCandidate[]>
}

function mapFound(row: Record<string, unknown>, source: LocationSource): FoundCandidate {
  return {
    source,
    driverId: toNumber(row.driverId),
    straightLineMeters: Math.round(toNumber(row.straightLineMeters)),
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    availableSince: toNullableDate(row.availableSince),
    measuredAt: toDate(row.measuredAt),
  }
}

function exclusion(p: Params, attemptId: number | null): string {
  if (attemptId === null) return 'true'
  return `NOT EXISTS (SELECT 1 FROM "DispatchCandidate" c WHERE c."attemptId" = ${p.add(attemptId)}::int AND c."driverId" = t."id")`
}

export class PostgisCandidateFinder implements CandidateFinder {
  async find(db: Sql, query: CandidateQuery, settings: DispatchSettings): Promise<FoundCandidate[]> {
    const source = query.source ?? 'GPS'
    const at = position(source)
    const p = new Params()
    // ST_MakePoint(X, Y) — LONGITUDE FIRST.
    const lng = p.add(query.pickup.longitude)
    const lat = p.add(query.pickup.latitude)
    const rows = await db.query<Record<string, unknown>>(
      `WITH origin AS (
         SELECT ST_SetSRID(ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326)::geography AS point
       )
       SELECT t."id" AS "driverId", ST_Distance(${at.point}, o.point) AS "straightLineMeters",
              ${at.lat} AS "latitude", ${at.lng} AS "longitude", p."availableSince", ${at.measuredAt} AS "measuredAt"
         FROM ${eligibleFrom(source)}, origin o
        WHERE ${availabilityPredicate(p, settings, source)}
          AND ST_DWithin(${at.point}, o.point, ${p.add(query.radiusMeters)}::double precision)
          AND ${capabilityPredicate(p, query.requirements)}
          AND ${exclusion(p, query.excludeAttemptId)}
        ORDER BY ${at.point} <-> o.point
        LIMIT ${p.add(query.limit)}::int`,
      p.values,
    )
    return rows.map((row) => mapFound(row, source))
  }
}

/**
 * Same predicates, great-circle distance in plain SQL instead of PostGIS.
 *
 * NOT for production: it scans every eligible row (no spatial index). It
 * exists so the dispatch engine can be exercised end-to-end against a real
 * Postgres that has no PostGIS (the CI/test environment) — the predicates
 * under test are the shared ones above; only the distance operator differs.
 */
export class PlainSqlCandidateFinder implements CandidateFinder {
  async find(db: Sql, query: CandidateQuery, settings: DispatchSettings): Promise<FoundCandidate[]> {
    const source = query.source ?? 'GPS'
    const at = position(source)
    const p = new Params()
    const lat = p.add(query.pickup.latitude)
    const lng = p.add(query.pickup.longitude)
    const distance = `(2 * 6371008.8 * asin(least(1, sqrt(
        power(sin(radians(${at.lat}::float8 - ${lat}::float8) / 2), 2)
        + cos(radians(${lat}::float8)) * cos(radians(${at.lat}::float8))
        * power(sin(radians(${at.lng}::float8 - ${lng}::float8) / 2), 2)))))`
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM (
         SELECT t."id" AS "driverId", ${distance} AS "straightLineMeters",
                ${at.lat} AS "latitude", ${at.lng} AS "longitude", p."availableSince", ${at.measuredAt} AS "measuredAt"
           FROM ${eligibleFrom(source)}
          WHERE ${availabilityPredicate(p, settings, source)}
            AND ${capabilityPredicate(p, query.requirements)}
            AND ${exclusion(p, query.excludeAttemptId)}
       ) d
       WHERE d."straightLineMeters" <= ${p.add(query.radiusMeters)}::float8
       ORDER BY d."straightLineMeters", d."driverId"
       LIMIT ${p.add(query.limit)}::int`,
      p.values,
    )
    return rows.map((row) => mapFound(row, source))
  }
}
