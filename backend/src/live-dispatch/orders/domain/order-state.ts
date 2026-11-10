/**
 * The order state machine: every allowed transition, who may perform it, and
 * its preconditions. Pure — the repositories call `planTransition` inside the
 * transaction that holds the order's row lock, so the decision is made on the
 * row as it is at that instant, never on a stale read.
 *
 * Offer states (PENDING → ACCEPTED/REJECTED/EXPIRED/REVOKED) are a separate,
 * smaller machine in `dispatching/offer-state.ts`.
 *
 * The table below is also the documentation: `docs/live-dispatch/02-state-machine.md`
 * is generated from `ORDER_TRANSITIONS` by `scripts/print-state-machine.ts`
 * so the two cannot drift.
 */
import { DispatchError } from '../../platform/errors'

export const ORDER_STATUSES = [
  'DRAFT',
  'SEARCHING',
  'PRICE_CONFIRMATION_PENDING',
  'ASSIGNED',
  'EN_ROUTE_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'TRANSPORTING',
  'COMPLETED',
  'NEEDS_ATTENTION',
  'CANCELLED',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export type AttentionKind =
  | 'SEARCH_EXHAUSTED'
  | 'SEARCH_TIMEOUT'
  | 'MANUAL_OFFER_FAILED'
  | 'DRIVER_CANCEL_REQUEST'
  | 'DRIVER_PROBLEM'
  | 'OPERATOR_FLAG'

/** Attention kinds that mean "the SEARCH failed" — no driver is attached */
export const SEARCH_ATTENTION_KINDS: readonly AttentionKind[] = ['SEARCH_EXHAUSTED', 'SEARCH_TIMEOUT', 'MANUAL_OFFER_FAILED']

/** Statuses in which a driver is attached to the order */
export const ASSIGNED_STATUSES: readonly OrderStatus[] = [
  'PRICE_CONFIRMATION_PENDING',
  'ASSIGNED',
  'EN_ROUTE_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'TRANSPORTING',
]

export const TERMINAL_STATUSES: readonly OrderStatus[] = ['COMPLETED', 'CANCELLED']

export type Actor = 'ADMIN' | 'DRIVER' | 'SYSTEM'

export type OrderAction =
  | 'START_DISPATCH'
  | 'STOP_DISPATCH'
  | 'OFFER_ACCEPTED'
  | 'SEARCH_FAILED'
  | 'CONFIRM_PRICE'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'START_TRANSPORT'
  | 'COMPLETE'
  | 'DRIVER_CANCEL_REQUEST'
  | 'FLAG_ATTENTION'
  | 'RESUME_FROM_ATTENTION'
  | 'RELEASE_ASSIGNMENT'
  | 'CANCEL'

export interface OrderStateSnapshot {
  status: OrderStatus
  attentionKind: AttentionKind | null
  statusBeforeAttention: OrderStatus | null
  hasActiveAssignment: boolean
  pricingMode: 'FIXED' | 'NEGOTIATION_REQUIRED'
  priceConfirmed: boolean
}

export interface TransitionRule {
  action: OrderAction
  from: readonly OrderStatus[]
  /** Literal target, or a description when the target depends on the order */
  to: OrderStatus | string
  actors: readonly Actor[]
  preconditions: string
}

/** The documentation table — the logic in `planTransition` implements exactly this */
export const ORDER_TRANSITIONS: readonly TransitionRule[] = [
  {
    action: 'START_DISPATCH',
    from: ['DRAFT', 'NEEDS_ATTENTION'],
    to: 'SEARCHING',
    actors: ['ADMIN'],
    preconditions:
      'requirements confirmed or overridden; FIXED needs a price; from NEEDS_ATTENTION only for a failed SEARCH (no driver attached)',
  },
  { action: 'STOP_DISPATCH', from: ['SEARCHING'], to: 'DRAFT', actors: ['ADMIN'], preconditions: 'pending offer is revoked in the same transaction' },
  {
    action: 'OFFER_ACCEPTED',
    from: ['SEARCHING'],
    to: 'ASSIGNED (FIXED) | PRICE_CONFIRMATION_PENDING (NEGOTIATION_REQUIRED)',
    actors: ['DRIVER'],
    preconditions: 'offer PENDING, before deadline (DB clock), terms version current, order and driver have no active assignment',
  },
  { action: 'SEARCH_FAILED', from: ['SEARCHING'], to: 'NEEDS_ATTENTION', actors: ['SYSTEM'], preconditions: 'candidates exhausted, attempt limit or max duration reached, no pending offer' },
  {
    action: 'CONFIRM_PRICE',
    from: ['PRICE_CONFIRMATION_PENDING', 'EN_ROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP'],
    to: 'ASSIGNED from PRICE_CONFIRMATION_PENDING, otherwise unchanged',
    // The DRIVER agrees the price with the customer on the phone and records
    // it himself (product decision, 2026-11) — an operator still can.
    actors: ['ADMIN', 'DRIVER'],
    preconditions: 'NEGOTIATION_REQUIRED and not yet confirmed; agreed price ≥ 0; a driver only on their own order',
  },
  { action: 'EN_ROUTE', from: ['ASSIGNED', 'PRICE_CONFIRMATION_PENDING'], to: 'EN_ROUTE_TO_PICKUP', actors: ['DRIVER', 'ADMIN'], preconditions: 'driver may head out while the price is being agreed' },
  { action: 'ARRIVED', from: ['ASSIGNED', 'PRICE_CONFIRMATION_PENDING', 'EN_ROUTE_TO_PICKUP'], to: 'ARRIVED_AT_PICKUP', actors: ['DRIVER', 'ADMIN'], preconditions: '—' },
  { action: 'START_TRANSPORT', from: ['ARRIVED_AT_PICKUP'], to: 'TRANSPORTING', actors: ['DRIVER', 'ADMIN'], preconditions: 'price FIXED or confirmed (PRICE_NOT_CONFIRMED otherwise)' },
  { action: 'COMPLETE', from: ['TRANSPORTING'], to: 'COMPLETED', actors: ['DRIVER', 'ADMIN'], preconditions: 'ends the assignment; does NOT change payment status' },
  {
    action: 'DRIVER_CANCEL_REQUEST',
    // Only before the driver set off (product decision, 2026-11). Once en
    // route, a driver can only report a PROBLEM; the operator decides.
    from: ['PRICE_CONFIRMATION_PENDING', 'ASSIGNED'],
    to: 'SEARCHING (redispatch: reason is not CUSTOMER_DECLINED and the pickup has coordinates) | NEEDS_ATTENTION (DRIVER_CANCEL_REQUEST)',
    actors: ['DRIVER'],
    preconditions:
      'not yet EN_ROUTE. Redispatch (2026-11): the driver is released and a new automatic search starts without him in the same transaction. Otherwise the assignment is KEPT until an operator decides — a customer who declined may mean the whole order is off',
  },
  {
    action: 'FLAG_ATTENTION',
    from: ['PRICE_CONFIRMATION_PENDING', 'ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'TRANSPORTING'],
    to: 'NEEDS_ATTENTION (OPERATOR_FLAG | DRIVER_PROBLEM)',
    actors: ['ADMIN'],
    preconditions: 'assignment is kept',
  },
  { action: 'RESUME_FROM_ATTENTION', from: ['NEEDS_ATTENTION'], to: 'statusBeforeAttention', actors: ['ADMIN'], preconditions: 'only when a driver is still attached; open driver request is resolved' },
  {
    action: 'RELEASE_ASSIGNMENT',
    from: ['NEEDS_ATTENTION', 'PRICE_CONFIRMATION_PENDING', 'ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP'],
    to: 'DRAFT, or SEARCHING when restartSearch=true',
    actors: ['ADMIN'],
    preconditions: 'explicit operator confirmation; ends the assignment, resolves the open request; one transaction',
  },
  { action: 'CANCEL', from: ['DRAFT', 'SEARCHING', 'PRICE_CONFIRMATION_PENDING', 'ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'TRANSPORTING', 'NEEDS_ATTENTION'], to: 'CANCELLED', actors: ['ADMIN'], preconditions: 'reason required (comment when OTHER); revokes pending offer, ends assignment' },
]

export interface PlannedTransition {
  to: OrderStatus
  /** The new value of statusBeforeAttention */
  statusBeforeAttention: OrderStatus | null
  attentionKind: AttentionKind | null
}

function invalid(action: OrderAction, order: OrderStateSnapshot, actor: Actor): DispatchError {
  return new DispatchError('INVALID_TRANSITION', { action, status: order.status, actor })
}

/**
 * Decides the target of `action` from `order` for `actor`, or throws a
 * DispatchError explaining why not. Pure.
 */
export function planTransition(
  action: OrderAction,
  order: OrderStateSnapshot,
  actor: Actor,
  extra: { attentionKind?: AttentionKind; restartSearch?: boolean; redispatch?: boolean } = {},
): PlannedTransition {
  const rule = ORDER_TRANSITIONS.find((candidate) => candidate.action === action)
  if (!rule || !rule.actors.includes(actor)) throw invalid(action, order, actor)
  if (!rule.from.includes(order.status)) {
    if (order.status === 'CANCELLED') throw new DispatchError('ORDER_CANCELLED')
    throw invalid(action, order, actor)
  }
  const plain = (to: OrderStatus): PlannedTransition => ({ to, statusBeforeAttention: null, attentionKind: null })

  switch (action) {
    case 'START_DISPATCH':
      if (order.status === 'NEEDS_ATTENTION') {
        if (order.hasActiveAssignment || !order.attentionKind || !SEARCH_ATTENTION_KINDS.includes(order.attentionKind)) {
          throw invalid(action, order, actor)
        }
      }
      return plain('SEARCHING')
    case 'STOP_DISPATCH':
      return plain('DRAFT')
    case 'OFFER_ACCEPTED':
      return plain(order.pricingMode === 'FIXED' ? 'ASSIGNED' : 'PRICE_CONFIRMATION_PENDING')
    case 'SEARCH_FAILED':
      return {
        to: 'NEEDS_ATTENTION',
        statusBeforeAttention: null,
        attentionKind: extra.attentionKind ?? 'SEARCH_EXHAUSTED',
      }
    case 'CONFIRM_PRICE':
      if (order.pricingMode !== 'NEGOTIATION_REQUIRED' || order.priceConfirmed) throw invalid(action, order, actor)
      return plain(order.status === 'PRICE_CONFIRMATION_PENDING' ? 'ASSIGNED' : order.status)
    case 'EN_ROUTE':
      return plain('EN_ROUTE_TO_PICKUP')
    case 'ARRIVED':
      return plain('ARRIVED_AT_PICKUP')
    case 'START_TRANSPORT':
      if (order.pricingMode === 'NEGOTIATION_REQUIRED' && !order.priceConfirmed) {
        throw new DispatchError('PRICE_NOT_CONFIRMED')
      }
      return plain('TRANSPORTING')
    case 'COMPLETE':
      return plain('COMPLETED')
    case 'DRIVER_CANCEL_REQUEST':
      if (extra.redispatch) return plain('SEARCHING')
      return { to: 'NEEDS_ATTENTION', statusBeforeAttention: order.status, attentionKind: 'DRIVER_CANCEL_REQUEST' }
    case 'FLAG_ATTENTION': {
      const kind = extra.attentionKind ?? 'OPERATOR_FLAG'
      if (kind !== 'OPERATOR_FLAG' && kind !== 'DRIVER_PROBLEM') throw invalid(action, order, actor)
      return { to: 'NEEDS_ATTENTION', statusBeforeAttention: order.status, attentionKind: kind }
    }
    case 'RESUME_FROM_ATTENTION':
      if (!order.hasActiveAssignment || !order.statusBeforeAttention) throw invalid(action, order, actor)
      return plain(order.statusBeforeAttention)
    case 'RELEASE_ASSIGNMENT':
      if (!order.hasActiveAssignment) throw invalid(action, order, actor)
      return plain(extra.restartSearch ? 'SEARCHING' : 'DRAFT')
    case 'CANCEL':
      return plain('CANCELLED')
  }
}

/** Driver-visible progress actions, in the order the app offers them */
export const DRIVER_PROGRESS_ACTIONS = ['EN_ROUTE', 'ARRIVED', 'START_TRANSPORT', 'COMPLETE'] as const
export type DriverProgressAction = (typeof DRIVER_PROGRESS_ACTIONS)[number]

/** Which progress buttons the app should enable for a status (server decides; app only renders) */
export function allowedDriverActions(order: OrderStateSnapshot): DriverProgressAction[] {
  return DRIVER_PROGRESS_ACTIONS.filter((action) => {
    try {
      planTransition(action, order, 'DRIVER')
      return true
    } catch {
      return false
    }
  })
}
