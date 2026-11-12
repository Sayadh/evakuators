/**
 * What the active-order screen shows, as one pure decision (unit-tested).
 *
 * The flow the driver walks (product decision, 2026-11):
 *
 *   accepted  → Call · [enter agreed price — REQUIRED first when negotiated, 2026-11-12] · «Շարժվում եմ» · «Չեղարկել»
 *   en route  → Call · Navigation (if coordinates) · «Տեղում եմ» · «Խնդիր կա»
 *   arrived   → Call · [enter agreed price] · «Սկսել տեղափոխումը» · «Խնդիր կա»
 *   transport → Call · Navigation to destination (if any) · «Ավարտել» · «Խնդիր կա»
 *
 * The SERVER still decides what is allowed (`allowedActions`, `canCancel`,
 * `canSetPrice`); this only picks how to present it. In particular it shows
 * ONE next step, never every allowed one — the server allows «Տեղում եմ»
 * straight from «accepted», but offering it next to «Շարժվում եմ» is exactly
 * the kind of choice that confuses a driver.
 */
import type { ActiveOrder, ProgressAction } from '../api/types'

export interface OrderScreenPlan {
  /** The single next progress step, or null (waiting for a price or an operator) */
  primary: ProgressAction | null
  /** Where «Նավիգացիա» leads, or null when it is not shown */
  navigateTo: { latitude: number; longitude: number } | null
  /** The driver may (and, before transport, must) record the agreed price */
  priceEntry: boolean
  /** The next step is blocked only by the missing price (setting off or transport) */
  priceBlocksTransport: boolean
  /** Bottom action: ask to cancel (before setting off) or report a problem */
  secondary: 'CANCEL' | 'PROBLEM' | null
  waitingForOperator: boolean
}

type PlanInput = Pick<ActiveOrder, 'status' | 'allowedActions' | 'canCancel' | 'canSetPrice' | 'pickup' | 'destination'>

export function planOrderScreen(order: PlanInput): OrderScreenPlan {
  const waitingForOperator = order.status === 'NEEDS_ATTENTION'
  const primary = waitingForOperator ? null : (order.allowedActions[0] ?? null)

  let navigateTo: OrderScreenPlan['navigateTo'] = null
  if (order.status === 'EN_ROUTE_TO_PICKUP' && order.pickup.latitude !== null && order.pickup.longitude !== null) {
    navigateTo = { latitude: order.pickup.latitude, longitude: order.pickup.longitude }
  } else if (order.status === 'TRANSPORTING' && order.destination && order.destination.latitude !== null && order.destination.longitude !== null) {
    navigateTo = { latitude: order.destination.latitude, longitude: order.destination.longitude }
  }

  return {
    primary,
    navigateTo,
    priceEntry: order.canSetPrice && !waitingForOperator,
    // Since 2026-11-12 the server allows no step at all before the agreed price
    // (accepted → «Շարժվում եմ» too), so the price IS the next step there as well
    priceBlocksTransport: !waitingForOperator && order.canSetPrice && primary === null,
    secondary: waitingForOperator ? null : order.canCancel ? 'CANCEL' : 'PROBLEM',
    waitingForOperator,
  }
}

/** "25 000", "25000 ֏", "25.000" → 25000; anything else → null */
export function parseAmd(input: string): number | null {
  const digits = input.replace(/[\s.,֏]/g, '')
  if (!/^\d{1,8}$/.test(digits)) return null
  const n = Number(digits)
  return n <= 10_000_000 ? n : null
}
