/**
 * Missed offers («Բաց թողնված», 2026-11): what the app derives from the
 * server's list. Pure (unit-tested). "Unseen" = offered after the driver last
 * opened the list — the Home screen and the Orders tab count only those.
 */
import { yerevanDateKey } from '~/utils/formatters'
import type { MissedOffer } from '../api/types'

/** The server's page size (`GET /driver-app/orders/missed`, default limit) */
export const MISSED_PAGE_SIZE = 20

export function nextMissedCursor(items: MissedOffer[]): string | undefined {
  return items[items.length - 1]?.offeredAt
}

export function unseenCount(items: MissedOffer[], seenAtMs: number | null): number {
  if (seenAtMs === null) return items.length
  return items.filter((item) => Date.parse(item.offeredAt) > seenAtMs).length
}

export function groupMissedByDay(items: MissedOffer[]): { dayKey: string; items: MissedOffer[] }[] {
  const groups: { dayKey: string; items: MissedOffer[] }[] = []
  for (const item of items) {
    const dayKey = yerevanDateKey(new Date(item.offeredAt))
    const last = groups[groups.length - 1]
    if (last?.dayKey === dayKey) last.items.push(item)
    else groups.push({ dayKey, items: [item] })
  }
  return groups
}

/** Road distance when the server had a route, else the straight line (said so by `approximate`) */
export function pickupDistance(item: MissedOffer): { meters: number; approximate: boolean } | null {
  if (item.toPickup.roadMeters !== null) return { meters: item.toPickup.roadMeters, approximate: false }
  if (item.toPickup.straightLineMeters !== null) return { meters: item.toPickup.straightLineMeters, approximate: true }
  return null
}

/** Did some offers never reach the phone? Then the alert setup is what to fix */
export function hasDeliveryProblem(items: MissedOffer[]): boolean {
  return items.some((item) => item.reason === 'NOT_DELIVERED')
}
