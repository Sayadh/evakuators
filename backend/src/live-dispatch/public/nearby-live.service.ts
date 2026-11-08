/**
 * "Find the nearest tow truck" with LIVE positions — the existing `/evakuator`
 * search, extended. ONE list:
 *
 * - a website driver who uses the app, is online and free, and whose phone
 *   reported a fresh GPS fix is measured from WHERE THEY ARE NOW (and marked
 *   `live`);
 * - every other website driver is measured from the parking spot in their
 *   profile — the existing search, unchanged;
 * - a driver is never listed twice: the live entry replaces the profile one.
 *
 * Who can appear: only drivers with a public website card. App-only drivers
 * (FleetDriver kind APP_ONLY) have no card and never appear on the website —
 * the query selects `towTruckId IS NOT NULL` before LIMIT.
 *
 * What this search does NOT do (and the tests assert it): it creates no order,
 * reserves no driver, asks no driver for a fix, sends no notification. Live
 * coordinates NEVER leave the server: a live entry carries only a distance
 * rounded to 100 m and a time rounded to the minute.
 *
 * Specialist vehicle types (manipulator / heavy-duty) are excluded INSIDE the
 * query, before LIMIT — the same general-discovery rule as every public
 * listing (CLAUDE.md § "Two vehicle types are landing-page-only").
 *
 * A result is not a promise: the visitor still calls the driver, and the
 * driver may take another job a second later. The response says so.
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

/** Same shape as the existing search's result (NearestTowTruckApi), plus `live` */
export interface NearbyItem {
  towTruck: PublicCard
  straightLineMeters: number
  roadMeters?: number
  durationSeconds?: number
  /** Present only when measured from the driver's live phone position */
  live?: { freshness: 'UNDER_1_MIN' | 'UNDER_2_MIN' }
}

export interface LiveNearbyResponse {
  results: NearbyItem[]
  /** Road figures are real for this response (same meaning as the existing search) */
  routed: boolean
  /** How many results are measured from a live position */
  liveCount: number
  computedAt: string
  disclaimer: 'NOT_A_RESERVATION'
}

export interface FallbackSearchResult {
  results: { towTruck: PublicCard; straightLineMeters: number; roadMeters?: number; durationSeconds?: number }[]
  routed: boolean
}

export interface LiveCandidate {
  /** TowTruck.id — the public card, never the FleetDriver id */
  towTruckId: number
  straightLineMeters: number
  latitude: number
  longitude: number
  gpsAgeSeconds: number
}

export interface LiveCandidateQuery {
  find(db: Sql, point: { latitude: number; longitude: number }, radiusMeters: number, limit: number, settings: DispatchSettings): Promise<LiveCandidate[]>
}

const LIVE_RADIUS_METERS = 50_000
const PREFILTER = 25
/** Same as NEAREST_RESULT_LIMIT in src/nearest/nearest.constants.ts */
export const NEARBY_RESULT_LIMIT = 10

function publicWhere(p: Params, settings: DispatchSettings): string {
  return `t."towTruckId" IS NOT NULL
          AND t."vehicleType" <> ALL(${p.add(pgArray([...SPECIALIST_VEHICLE_TYPES]))}::text[])
          AND ${availabilityPredicate(p, settings)}`
}

function mapCandidate(r: Record<string, unknown>): LiveCandidate {
  return {
    towTruckId: Number(r.towTruckId),
    straightLineMeters: Number(r.d),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    gpsAgeSeconds: Number(r.age),
  }
}

/** PostGIS, index-aware — production */
export class PostgisLiveQuery implements LiveCandidateQuery {
  async find(db: Sql, point: { latitude: number; longitude: number }, radiusMeters: number, limit: number, settings: DispatchSettings) {
    const p = new Params()
    const lng = p.add(point.longitude)
    const lat = p.add(point.latitude)
    const rows = await db.query<Record<string, unknown>>(
      `WITH origin AS (SELECT ST_SetSRID(ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326)::geography AS point)
       SELECT t."towTruckId", ST_Distance(lc."location", o.point) AS "d", lc."latitude", lc."longitude",
              EXTRACT(EPOCH FROM now() - lc."measuredAt")::float8 AS "age"
         FROM ${ELIGIBLE_FROM}, origin o
        WHERE ST_DWithin(lc."location", o.point, ${p.add(radiusMeters)}::double precision)
          AND ${publicWhere(p, settings)}
        ORDER BY lc."location" <-> o.point
        LIMIT ${p.add(limit)}::int`,
      p.values,
    )
    return rows.map(mapCandidate)
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
         SELECT t."towTruckId", ${distance} AS "d", lc."latitude", lc."longitude",
                EXTRACT(EPOCH FROM now() - lc."measuredAt")::float8 AS "age"
           FROM ${ELIGIBLE_FROM}
          WHERE ${publicWhere(p, settings)}) x
        WHERE x."d" <= ${p.add(radiusMeters)}::float8 ORDER BY x."d" LIMIT ${p.add(limit)}::int`,
      p.values,
    )
    return rows.map(mapCandidate)
  }
}

const round100 = (m: number) => Math.round(m / 100) * 100
const roundMinute = (s: number) => Math.max(60, Math.round(s / 60) * 60)

/**
 * Pure: one ranked list from live entries and the profile-based search.
 * Ranking is the existing search's rule, applied to everyone: drivers with a
 * road time first, fastest first; then the rest by straight line.
 */
export function mergeNearby(live: NearbyItem[], fallback: FallbackSearchResult['results'], limit: number): NearbyItem[] {
  const liveIds = new Set(live.map((i) => i.towTruck.id))
  const merged: NearbyItem[] = [...live, ...fallback.filter((r) => !liveIds.has(r.towTruck.id))]
  return merged
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const at = a.item.durationSeconds
      const bt = b.item.durationSeconds
      if (at !== undefined && bt !== undefined && at !== bt) return at - bt
      if ((at === undefined) !== (bt === undefined)) return at === undefined ? 1 : -1
      if (a.item.straightLineMeters !== b.item.straightLineMeters) return a.item.straightLineMeters - b.item.straightLineMeters
      // A live position beats a profile position at the same distance.
      if (!!a.item.live !== !!b.item.live) return a.item.live ? -1 : 1
      return a.index - b.index
    })
    .slice(0, limit)
    .map((x) => x.item)
}

export class NearbyLiveService {
  private readonly cache = new Map<string, { at: number; value: { items: NearbyItem[]; routed: boolean } }>()

  constructor(
    private readonly db: Sql,
    private readonly query: LiveCandidateQuery,
    private readonly routing: GuardedRouting,
    private readonly loadSettings: () => Promise<DispatchSettings>,
    private readonly cardsByIds: (ids: number[]) => Promise<PublicCard[]>,
    private readonly fallbackSearch: (latitude: number, longitude: number, skipRouting: boolean) => Promise<FallbackSearchResult>,
    private readonly options: { enabled: boolean; cacheTtlMs: number; cacheMax: number } = { enabled: false, cacheTtlMs: 60_000, cacheMax: 500 },
  ) {}

  async search(latitude: number, longitude: number, skipRouting: boolean): Promise<LiveNearbyResponse> {
    if (!this.options.enabled) throw new DispatchError('FEATURE_DISABLED')
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !isWithinArmenia(latitude, longitude)) {
      throw new DispatchError('VALIDATION_FAILED', { field: 'latitude/longitude' })
    }
    const live = await this.livePart(latitude, longitude, skipRouting)
    const fallback = await this.fallbackSearch(latitude, longitude, skipRouting)
    const results = mergeNearby(live.items, fallback.results, NEARBY_RESULT_LIMIT)
    return {
      results,
      // Same meaning as the existing search: road figures are real here.
      routed: results.some((r) => r.durationSeconds !== undefined) && (live.routed || fallback.routed),
      liveCount: results.filter((r) => r.live).length,
      computedAt: new Date().toISOString(),
      disclaimer: 'NOT_A_RESERVATION',
    }
  }

  private async livePart(latitude: number, longitude: number, skipRouting: boolean): Promise<{ items: NearbyItem[]; routed: boolean }> {
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
    const cards = ranked.length > 0 ? await this.cardsByIds(ranked.map((r) => r.f.towTruckId)) : []
    const byId = new Map(cards.map((c) => [c.id, c]))
    const items: NearbyItem[] = ranked
      .filter((r) => byId.has(r.f.towTruckId))
      .map((r) => {
        const item: NearbyItem = {
          towTruck: byId.get(r.f.towTruckId)!,
          straightLineMeters: round100(r.f.straightLineMeters),
          live: { freshness: r.f.gpsAgeSeconds <= 60 ? 'UNDER_1_MIN' : 'UNDER_2_MIN' },
        }
        if (r.e.ok) {
          item.roadMeters = round100(r.e.meters)
          item.durationSeconds = roundMinute(r.e.seconds)
        }
        return item
      })
    const value = { items, routed }
    if (this.cache.size >= this.options.cacheMax) this.cache.delete(this.cache.keys().next().value as string)
    this.cache.set(key, { at: now, value })
    return value
  }
}
