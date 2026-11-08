/**
 * Phase one of candidate selection: who is plausible, nearest first, from OUR
 * database — availability, freshness, capability, and geography.
 *
 * Production uses PostGIS: `ST_DWithin` on the GiST-indexed generated
 * `DriverLocationCurrent.location`, ordered by the `<->` KNN operator, bounded
 * by LIMIT — the same shape as `NearestRepository` (docs/nearest-search.md).
 *
 * The registered base or city of a driver is NEVER used here: only the live
 * fix. A driver without a fresh fix is simply not a candidate.
 */
import { Params, toDate, toNullableDate, toNumber } from '../platform/params'
import type { DispatchSettings } from '../platform/settings'
import type { Sql } from '../platform/sql'
import type { OrderRequirements } from '../orders/domain/requirements'
import { availabilityPredicate, capabilityPredicate, ELIGIBLE_FROM } from './eligibility-sql'

export interface FoundCandidate {
  towTruckId: number
  straightLineMeters: number
  latitude: number
  longitude: number
  availableSince: Date | null
  measuredAt: Date
}

export interface CandidateQuery {
  pickup: { latitude: number; longitude: number }
  radiusMeters: number
  limit: number
  requirements: OrderRequirements
  /** Drivers already considered in this attempt */
  excludeAttemptId: number | null
}

export interface CandidateFinder {
  find(db: Sql, query: CandidateQuery, settings: DispatchSettings): Promise<FoundCandidate[]>
}

function mapFound(row: Record<string, unknown>): FoundCandidate {
  return {
    towTruckId: toNumber(row.towTruckId),
    straightLineMeters: Math.round(toNumber(row.straightLineMeters)),
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    availableSince: toNullableDate(row.availableSince),
    measuredAt: toDate(row.measuredAt),
  }
}

function exclusion(p: Params, attemptId: number | null): string {
  if (attemptId === null) return 'true'
  return `NOT EXISTS (SELECT 1 FROM "DispatchCandidate" c WHERE c."attemptId" = ${p.add(attemptId)}::int AND c."towTruckId" = t."id")`
}

export class PostgisCandidateFinder implements CandidateFinder {
  async find(db: Sql, query: CandidateQuery, settings: DispatchSettings): Promise<FoundCandidate[]> {
    const p = new Params()
    // ST_MakePoint(X, Y) — LONGITUDE FIRST.
    const lng = p.add(query.pickup.longitude)
    const lat = p.add(query.pickup.latitude)
    const rows = await db.query<Record<string, unknown>>(
      `WITH origin AS (
         SELECT ST_SetSRID(ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326)::geography AS point
       )
       SELECT t."id" AS "towTruckId", ST_Distance(lc."location", o.point) AS "straightLineMeters",
              lc."latitude", lc."longitude", p."availableSince", lc."measuredAt"
         FROM ${ELIGIBLE_FROM}, origin o
        WHERE ST_DWithin(lc."location", o.point, ${p.add(query.radiusMeters)}::double precision)
          AND ${availabilityPredicate(p, settings)}
          AND ${capabilityPredicate(p, query.requirements)}
          AND ${exclusion(p, query.excludeAttemptId)}
        ORDER BY lc."location" <-> o.point
        LIMIT ${p.add(query.limit)}::int`,
      p.values,
    )
    return rows.map(mapFound)
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
    const p = new Params()
    const lat = p.add(query.pickup.latitude)
    const lng = p.add(query.pickup.longitude)
    const distance = `(2 * 6371008.8 * asin(least(1, sqrt(
        power(sin(radians(lc."latitude"::float8 - ${lat}::float8) / 2), 2)
        + cos(radians(${lat}::float8)) * cos(radians(lc."latitude"::float8))
        * power(sin(radians(lc."longitude"::float8 - ${lng}::float8) / 2), 2)))))`
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM (
         SELECT t."id" AS "towTruckId", ${distance} AS "straightLineMeters",
                lc."latitude", lc."longitude", p."availableSince", lc."measuredAt"
           FROM ${ELIGIBLE_FROM}
          WHERE ${availabilityPredicate(p, settings)}
            AND ${capabilityPredicate(p, query.requirements)}
            AND ${exclusion(p, query.excludeAttemptId)}
       ) d
       WHERE d."straightLineMeters" <= ${p.add(query.radiusMeters)}::float8
       ORDER BY d."straightLineMeters", d."towTruckId"
       LIMIT ${p.add(query.limit)}::int`,
      p.values,
    )
    return rows.map(mapFound)
  }
}
