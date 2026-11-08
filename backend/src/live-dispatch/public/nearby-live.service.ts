/**
 * "Find the nearest tow truck" with LIVE positions — the existing `/evakuator`
 * button, extended.
 *
 * What this search does NOT do (and the tests assert it): it creates no
 * order, reserves no driver, asks no driver for a GPS fix, sends no
 * notification. It reads what drivers' apps already reported.
 *
 * Two clearly separate sections in the answer:
 *
 * - `live` — drivers who are online, free, and whose GPS is fresh, ranked by
 *   road ETA when the routing budget allows. Their exact coordinates NEVER
 *   leave the server: only a rounded distance, a rounded ETA, and a label.
 * - `fallback` — the existing search (distance from the parking spot in the
 *   driver's profile), unchanged, minus anyone already listed live.
 *
 * A result is not a promise: the visitor still calls the driver, and the
 * driver may have taken another job a second later. The response says so.
 *
 * Specialist vehicle types (manipulator / heavy-duty) are excluded INSIDE
 * the query, before LIMIT — the same general-discovery rule as every public
 * listing (CLAUDE.md § "Two vehicle types are landing-page-only").
 */
import { isWithinArmenia } from '../../common/armenia-bounds'
import { SPECIALIST_VEHICLE_TYPES } from '../../tow-trucks/vehicle-types'
import { availabilityPredicate, ELIGIBLE_FROM } from '../dispatching/eligibility-sql'
import { DispatchError } from '../platform/errors'
import { Params } from '../platform/params'
import { pgArray } from '../platform/sql'
import type { DispatchSettings } from '../platform/settings'
import type { Sql } from '../platform/sql'
import type { GuardedRouting } from '../routing/routing-provider'

export interface PublicCard {
  id: number
  [key: string]: unknown
}

export interface LiveNearbyItem {
  towTruck: PublicCard
  /** Rounded to 100 m; road distance when routed, otherwise null */
  roadMeters: number | null
  /** Rounded to the minute; only ever present together with roadMeters */
  etaSeconds: number | null
  /** Rounded to 100 m; shown only as «ուղիղ գծով» when there is no road figure */
  straightLineMeters: number
  availability: 'ONLINE_FREE'
  locationFreshness: 'UNDER_1_MIN' | 'UNDER_2_MIN'
}

export interface LiveNearbyResponse {
  computedAt: string
  live: { items: LiveNearbyItem[]; routed: boolean; reason: 'OK' | 'NO_LIVE_DRIVERS' }
  fallback: unknown
  disclaimer: 'NOT_A_RESERVATION'
}

export interface LiveCandidateQuery {
  find(db: Sql, point: { latitude: number; longitude: number }, radiusMeters: number, limit: number, settings: DispatchSettings): Promise<
    { towTruckId: number; straightLineMeters: number; latitude: number; longitude: number; gpsAgeSeconds: number }[]
  >
}

const LIVE_RADIUS_METERS = 50_000
const PREFILTER = 25

/** PostGIS, index-aware — production */
export class PostgisLiveQuery implements LiveCandidateQuery {
  async find(db: Sql, point: { latitude: number; longitude: number }, radiusMeters: number, limit: number, settings: DispatchSettings) {
    const p = new Params()
    const lng = p.add(point.longitude)
    const lat = p.add(point.latitude)
    const rows = await db.query<Record<string, unknown>>(
      `WITH origin AS (SELECT ST_SetSRID(ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326)::geography AS point)
       SELECT t."id" AS "towTruckId", ST_Distance(lc."location", o.point) AS "d", lc."latitude", lc."longitude",
              EXTRACT(EPOCH FROM now() - lc."measuredAt")::float8 AS "age"
         FROM ${ELIGIBLE_FROM}, origin o
        WHERE ST_DWithin(lc."location", o.point, ${p.add(radiusMeters)}::double precision)
          AND t."vehicleType" <> ALL(${p.add(pgArray([...SPECIALIST_VEHICLE_TYPES]))}::text[])
          AND ${availabilityPredicate(p, settings)}
        ORDER BY lc."location" <-> o.point
        LIMIT ${p.add(limit)}::int`,
      p.values,
    )
    return rows.map((r) => ({
      towTruckId: Number(r.towTruckId),
      straightLineMeters: Number(r.d),
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      gpsAgeSeconds: Number(r.age),
    }))
  }
}

/** Same predicates without PostGIS — tests only (see PlainSqlCandidateFinder) */
export class PlainSqlLiveQuery implements LiveCandidateQuery {
  async find(db: Sql, point: { latitude: number; longitude: number }, radiusMeters: number, limit: number, settings: DispatchSettings) {
    const p = new Params()
    const lat = p.add(point.latitude)
    const lng = p.add(point.longitude)
    const distance = `(2 * 6371008.8 * asin(least(1, sqrt(power(sin(radians(lc."latitude"::float8 - ${lat}::float8) / 2), 2)
      + cos(radians(${lat}::float8)) * cos(radians(lc."latitude"::float8)) * power(sin(radians(lc."longitude"::float8 - ${lng}::float8) / 2), 2)))))`
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM (
         SELECT t."id" AS "towTruckId", ${distance} AS "d", lc."latitude", lc."longitude",
                EXTRACT(EPOCH FROM now() - lc."measuredAt")::float8 AS "age"
           FROM ${ELIGIBLE_FROM}
          WHERE t."vehicleType" <> ALL(${p.add(pgArray([...SPECIALIST_VEHICLE_TYPES]))}::text[])
            AND ${availabilityPredicate(p, settings)}) x
        WHERE x."d" <= ${p.add(radiusMeters)}::float8 ORDER BY x."d" LIMIT ${p.add(limit)}::int`,
      p.values,
    )
    return rows.map((r) => ({
      towTruckId: Number(r.towTruckId),
      straightLineMeters: Number(r.d),
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      gpsAgeSeconds: Number(r.age),
    }))
  }
}

const round100 = (m: number) => Math.round(m / 100) * 100
const roundMinute = (s: number) => Math.max(60, Math.round(s / 60) * 60)

export class NearbyLiveService {
  private readonly cache = new Map<string, { at: number; value: Omit<LiveNearbyResponse, 'fallback'> }>()

  constructor(
    private readonly db: Sql,
    private readonly query: LiveCandidateQuery,
    private readonly routing: GuardedRouting,
    private readonly loadSettings: () => Promise<DispatchSettings>,
    private readonly cardsByIds: (ids: number[]) => Promise<PublicCard[]>,
    private readonly fallbackSearch: (latitude: number, longitude: number, skipRouting: boolean) => Promise<{ results: { towTruck: { id: number } }[] } & Record<string, unknown>>,
    private readonly options: { enabled: boolean; cacheTtlMs: number; cacheMax: number } = { enabled: false, cacheTtlMs: 60_000, cacheMax: 500 },
  ) {}

  async search(latitude: number, longitude: number, skipRouting: boolean): Promise<LiveNearbyResponse> {
    if (!this.options.enabled) throw new DispatchError('FEATURE_DISABLED')
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !isWithinArmenia(latitude, longitude)) {
      throw new DispatchError('VALIDATION_FAILED', { field: 'latitude/longitude' })
    }
    const live = await this.liveSection(latitude, longitude, skipRouting)
    const fallback = await this.fallbackSearch(latitude, longitude, skipRouting)
    const liveIds = new Set(live.live.items.map((i) => i.towTruck.id))
    return {
      ...live,
      fallback: { ...fallback, results: fallback.results.filter((r) => !liveIds.has(r.towTruck.id)) },
    }
  }

  private async liveSection(latitude: number, longitude: number, skipRouting: boolean): Promise<Omit<LiveNearbyResponse, 'fallback'>> {
    // ~110 m neighbourhood key; the visitor's exact position exists nowhere
    // else on the server and is never written to the database or logs.
    const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}|${skipRouting ? 'nr' : 'r'}`
    const routedKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}|r`
    const now = Date.now()
    for (const k of skipRouting ? [routedKey, key] : [key]) {
      const hit = this.cache.get(k)
      if (hit && now - hit.at < this.options.cacheTtlMs) return hit.value
    }

    const settings = await this.loadSettings()
    const found = await this.query.find(this.db, { latitude, longitude }, LIVE_RADIUS_METERS, PREFILTER, settings)
    let routed = false
    let entries: ({ ok: true; meters: number; seconds: number } | { ok: false })[] = found.map(() => ({ ok: false }))
    if (!skipRouting && found.length > 0) {
      const matrix = await this.routing.matrix(found.map((f) => ({ latitude: f.latitude, longitude: f.longitude })), { latitude, longitude })
      entries = matrix.entries
      routed = matrix.entries.some((e) => e.ok)
    }
    const ranked = found
      .map((f, i) => ({ f, e: entries[i] }))
      .sort((a, b) => {
        if (a.e.ok && b.e.ok) return a.e.seconds - b.e.seconds
        if (a.e.ok !== b.e.ok) return a.e.ok ? -1 : 1
        return a.f.straightLineMeters - b.f.straightLineMeters
      })
      .slice(0, settings.publicNearbyLiveLimit)
    const cards = await this.cardsByIds(ranked.map((r) => r.f.towTruckId))
    const byId = new Map(cards.map((c) => [c.id, c]))
    const items: LiveNearbyItem[] = ranked
      .filter((r) => byId.has(r.f.towTruckId))
      .map((r) => ({
        towTruck: byId.get(r.f.towTruckId)!,
        roadMeters: r.e.ok ? round100(r.e.meters) : null,
        etaSeconds: r.e.ok ? roundMinute(r.e.seconds) : null,
        straightLineMeters: round100(r.f.straightLineMeters),
        availability: 'ONLINE_FREE' as const,
        locationFreshness: r.f.gpsAgeSeconds <= 60 ? ('UNDER_1_MIN' as const) : ('UNDER_2_MIN' as const),
      }))
    const value = {
      computedAt: new Date().toISOString(),
      live: { items, routed, reason: items.length > 0 ? ('OK' as const) : ('NO_LIVE_DRIVERS' as const) },
      disclaimer: 'NOT_A_RESERVATION' as const,
    }
    if (this.cache.size >= this.options.cacheMax) this.cache.delete(this.cache.keys().next().value as string)
    this.cache.set(key, { at: now, value })
    return value
  }
}
