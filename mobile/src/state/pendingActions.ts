/**
 * Mutations the driver started (accept, progress, request). Each keeps ONE
 * idempotency key for its whole life, so a retry after a network failure is
 * the SAME request to the server — never a second accept.
 *
 * States shown in the UI: SENDING → (CONFIRMED | FAILED | UNCERTAIN).
 * UNCERTAIN = the request may or may not have reached the server (timeout,
 * connection dropped). It is resolved ONLY by re-reading server state on
 * reconnect, never by assuming success. Nothing is shown as accepted until
 * the server said so.
 */
export type PendingKind = 'ACCEPT' | 'REJECT' | 'PROGRESS' | 'REQUEST'
export type PendingStatus = 'SENDING' | 'CONFIRMED' | 'FAILED' | 'UNCERTAIN'

export interface PendingAction {
  id: string
  kind: PendingKind
  idempotencyKey: string
  targetId: string
  payload: Record<string, unknown>
  status: PendingStatus
  errorCode: string | null
  createdAt: number
}

export interface ServerView {
  currentOfferId: string | null
  activeOrderId: number | null
  activeOrderStatus: string | null
}

/**
 * Reconciles UNCERTAIN actions against a fresh snapshot. A pending ACCEPT is
 * CONFIRMED only if the server now shows an active order (the accept won); if
 * the offer is gone and there is no order, it FAILED. Otherwise it stays
 * uncertain and is retried with the SAME key (the server replays the answer).
 */
export function reconcile(actions: PendingAction[], server: ServerView): PendingAction[] {
  return actions.map((action) => {
    if (action.status !== 'UNCERTAIN') return action
    if (action.kind === 'ACCEPT') {
      if (server.activeOrderId !== null) return { ...action, status: 'CONFIRMED' }
      if (server.currentOfferId !== action.targetId) return { ...action, status: 'FAILED', errorCode: 'OFFER_EXPIRED' }
      return action
    }
    if (action.kind === 'REJECT') {
      return server.currentOfferId !== action.targetId ? { ...action, status: 'CONFIRMED' } : action
    }
    return action
  })
}

export function needsRetry(action: PendingAction): boolean {
  return action.status === 'UNCERTAIN'
}
