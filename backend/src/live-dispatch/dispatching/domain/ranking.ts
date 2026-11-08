/**
 * Ordering candidates for sequential offers.
 *
 * Mostly by road ETA. ETAs within `etaTieSeconds` of each other are treated as
 * equal and broken by who has been waiting free the longest (`availableSince`),
 * then by id, so the order is total and stable.
 *
 * Implemented with BUCKETS rather than "|a − b| ≤ tie" inside the comparator:
 * that comparison is not transitive (a≈b, b≈c, a≉c) and makes `sort()`
 * undefined. Bucketing is transitive by construction.
 *
 * Candidates the provider could not route go AFTER every routed one, by
 * straight line. They are still offered — an unroutable pair is usually a
 * provider gap, not an impassable road — but their straight line is never
 * presented as a road figure (the offer carries `etaSeconds: null`).
 *
 * No paid priority, rating boost or partner tier here: none is approved for
 * automatic dispatch.
 */
import type { RouteEntry } from '../../routing/routing-provider'

export interface RankInput {
  towTruckId: number
  straightLineMeters: number
  route: RouteEntry | null
  availableSince: Date | null
}

export interface Ranked extends RankInput {
  rank: number
}

export function rankCandidates(candidates: RankInput[], etaTieSeconds: number): Ranked[] {
  const tie = Math.max(1, etaTieSeconds)
  const waited = (c: RankInput) => (c.availableSince ? c.availableSince.getTime() : Number.MAX_SAFE_INTEGER)
  const sorted = [...candidates].sort((a, b) => {
    const aOk = a.route?.ok === true
    const bOk = b.route?.ok === true
    if (aOk !== bOk) return aOk ? -1 : 1
    if (aOk && bOk) {
      const aEta = (a.route as { seconds: number }).seconds
      const bEta = (b.route as { seconds: number }).seconds
      const bucket = Math.floor(aEta / tie) - Math.floor(bEta / tie)
      if (bucket !== 0) return bucket
      const waitedDiff = waited(a) - waited(b)
      if (waitedDiff !== 0) return waitedDiff
      if (aEta !== bEta) return aEta - bEta
      return a.towTruckId - b.towTruckId
    }
    if (a.straightLineMeters !== b.straightLineMeters) return a.straightLineMeters - b.straightLineMeters
    const waitedDiff = waited(a) - waited(b)
    if (waitedDiff !== 0) return waitedDiff
    return a.towTruckId - b.towTruckId
  })
  return sorted.map((candidate, index) => ({ ...candidate, rank: index }))
}

/** Yerevan's centre and the radius treated as "in the city" for search radii */
export const YEREVAN_CENTRE = { latitude: 40.1792, longitude: 44.4991 }
export const YEREVAN_RADIUS_METERS = 15_000

export function searchRadii(
  pickupStraightLineToYerevanCentre: number,
  settings: { yerevanRadiiMeters: number[]; regionRadiiMeters: number[] },
): number[] {
  return pickupStraightLineToYerevanCentre <= YEREVAN_RADIUS_METERS ? settings.yerevanRadiiMeters : settings.regionRadiiMeters
}
