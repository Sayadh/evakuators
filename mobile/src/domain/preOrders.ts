/**
 * Pre-orders (2026-11-17): the pure parts of the screen — what needs his
 * answer, and the job as short lines. Tested in test/preOrders.test.ts.
 */
import type { PreOrder } from '../api/types'

/** Open and not yet priced by him: what the badge counts */
export function unansweredCount(items: PreOrder[]): number {
  return items.filter((p) => p.open && p.myBidAmd === null).length
}

/**
 * The number on the «Պատվերներ» tab: open, not priced by him and not yet
 * seen (opening the list marks what it shows as seen).
 */
export function unseenCount(items: PreOrder[], seen: ReadonlySet<number>): number {
  return items.filter((p) => p.open && p.myBidAmd === null && !seen.has(p.id)).length
}

/** What to keep of the seen ids: only the ones still listed, so the stored set never grows */
export function pruneSeen(items: PreOrder[], seen: ReadonlySet<number>, add: number[] = []): number[] {
  const listed = new Set(items.map((p) => p.id))
  return [...new Set([...seen, ...add])].filter((id) => listed.has(id))
}

/** Open ones first (unanswered before answered), then the closed ones, newest first inside each */
export function sortPreOrders(items: PreOrder[]): PreOrder[] {
  const rank = (p: PreOrder) => (p.open ? (p.myBidAmd === null ? 0 : 1) : 2)
  return [...items].sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt))
}

export type RequirementKey = 'wheelsLocked' | 'steeringLocked' | 'gearboxLocked' | 'manipulator' | 'skates'

/** Requirement chips as i18n keys (+ the skates count) */
export function requirementKeys(p: PreOrder): { key: RequirementKey; count?: number }[] {
  const r = p.requirements
  const out: { key: RequirementKey; count?: number }[] = []
  // Wheels that don't roll or a locked gearbox mean skates (2026-11-17): the cause, then the skates with the count if given
  if (r.wheelsRoll === false) out.push({ key: 'wheelsLocked' })
  if (r.gearboxLocked === true) out.push({ key: 'gearboxLocked' })
  if (r.steeringLocked === true) out.push({ key: 'steeringLocked' })
  if (r.needsWheelSkates === true || r.wheelsRoll === false) out.push(r.wheelSkatesCount ? { key: 'skates', count: r.wheelSkatesCount } : { key: 'skates' })
  if (r.needsManipulator === true) out.push({ key: 'manipulator' })
  return out
}

/** «Toyota Camry · 1600 կգ» */
export function vehicleLine(p: PreOrder, kg: string): string {
  const name = [p.vehicle.make, p.vehicle.model].filter(Boolean).join(' ')
  return [name, p.vehicle.weightKg ? `${p.vehicle.weightKg} ${kg}` : ''].filter(Boolean).join(' · ')
}
