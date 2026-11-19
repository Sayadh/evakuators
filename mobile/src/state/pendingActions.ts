/**
 * Mutations the driver started (accept, progress, request). Each keeps ONE
 * idempotency key for its whole life, so a retry after a network failure is
 * the SAME request to the server — never a second accept.
 *
 * States shown in the UI: SENDING → (CONFIRMED | FAILED | UNCERTAIN).
 * UNCERTAIN = the request may or may not have reached the server (timeout,
 * connection dropped). It is resolved by the next snapshot (`reconcile`) or by
 * re-sending it with the same key (`dueForRetry`) — never by assuming success.
 * Nothing is shown as accepted until the server said so.
 *
 * Everything here is pure: AppState holds the list, the screens read it
 * through `latestFor` / `isBusy`, and test/domain.test.ts pins the rules.
 */
export type PendingKind = 'ACCEPT' | 'REJECT' | 'PROGRESS' | 'PRICE' | 'REQUEST'
export type PendingStatus = 'SENDING' | 'CONFIRMED' | 'FAILED' | 'UNCERTAIN'

export interface PendingAction {
  id: string
  kind: PendingKind
  idempotencyKey: string
  targetId: string
  /**
   * PROGRESS carries `fromStatus` (the order status the step was pressed in),
   * PRICE `agreedPriceAmd`, REQUEST the request body — what `reconcile` needs.
   */
  payload: Record<string, unknown>
  status: PendingStatus
  errorCode: string | null
  createdAt: number
  /** When it was last sent — retries of an UNCERTAIN action are spaced by this */
  lastAttemptAt?: number
}

export interface ServerView {
  currentOfferId: string | null
  activeOrderId: number | null
  activeOrderStatus: string | null
  activeOrderAgreedAmd: number | null
}

/** An UNCERTAIN action is re-sent (same key) at most this often */
export const RETRY_GAP_MS = 5_000
/** Settled actions kept, newest first — enough for every screen, bounded for a long shift */
const KEEP_SETTLED = 20

const settled = (a: PendingAction) => a.status === 'CONFIRMED' || a.status === 'FAILED'
const same = (a: PendingAction, kind: PendingKind, targetId: string) => a.kind === kind && a.targetId === targetId

/**
 * Reconciles UNCERTAIN actions against a fresh snapshot:
 * - ACCEPT: CONFIRMED once an active order exists; FAILED once the offer is
 *   gone and there is no order.
 * - REJECT: CONFIRMED once the offer is gone.
 * - PROGRESS: CONFIRMED once the order left the status the step was pressed
 *   in, or is no longer active. Whoever moved it (this step arriving late, or
 *   an operator), the button the driver pressed is moot — leaving it
 *   «uncertain» locked the next step for good (2026-11-19).
 * - PRICE: CONFIRMED once the order shows that price, or is no longer active.
 * - REQUEST: CONFIRMED once the order is no longer active (a cancel took).
 * Anything else stays UNCERTAIN and is re-sent with the SAME key — the server
 * replays its first answer.
 */
export function reconcile(actions: PendingAction[], server: ServerView): PendingAction[] {
  return actions.map((action) => {
    if (action.status !== 'UNCERTAIN') return action
    const confirmed: PendingAction = { ...action, status: 'CONFIRMED', errorCode: null }
    const orderGone = server.activeOrderId === null || String(server.activeOrderId) !== action.targetId
    switch (action.kind) {
      case 'ACCEPT':
        if (server.activeOrderId !== null) return confirmed
        if (server.currentOfferId !== action.targetId) return { ...action, status: 'FAILED', errorCode: 'OFFER_EXPIRED' }
        return action
      case 'REJECT':
        return server.currentOfferId !== action.targetId ? confirmed : action
      case 'PROGRESS':
        return orderGone || server.activeOrderStatus !== action.payload.fromStatus ? confirmed : action
      case 'PRICE':
        return orderGone || server.activeOrderAgreedAmd === action.payload.agreedPriceAmd ? confirmed : action
      case 'REQUEST':
        return orderGone ? confirmed : action
    }
  })
}

/** UNCERTAIN actions whose last attempt is at least RETRY_GAP_MS old */
export function dueForRetry(actions: PendingAction[], now: number, gapMs = RETRY_GAP_MS): PendingAction[] {
  return actions.filter((a) => a.status === 'UNCERTAIN' && now - (a.lastAttemptAt ?? a.createdAt) >= gapMs)
}

/** One is already on its way (or may be): a second tap must not start another */
export function isBusy(actions: PendingAction[], kind: PendingKind, targetId: string): boolean {
  return actions.some((a) => same(a, kind, targetId) && (a.status === 'SENDING' || a.status === 'UNCERTAIN'))
}

/** The newest action of this kind for this target — what a screen shows */
export function latestFor(actions: PendingAction[], kind: PendingKind, targetId: string): PendingAction | undefined {
  let latest: PendingAction | undefined
  for (const a of actions) if (same(a, kind, targetId) && (!latest || a.createdAt >= latest.createdAt)) latest = a
  return latest
}

/**
 * Adds a new action. Older SETTLED actions of the same kind for the same
 * target go — a failure from an earlier step must not stay under the next one
 * — and the settled tail is bounded.
 */
export function track(actions: PendingAction[], next: PendingAction): PendingAction[] {
  const kept = actions.filter((a) => !(settled(a) && same(a, next.kind, next.targetId)))
  const open = kept.filter((a) => !settled(a))
  const done = kept.filter(settled).sort((x, y) => y.createdAt - x.createdAt).slice(0, KEEP_SETTLED)
  return [...open, ...done, next]
}

export function update(actions: PendingAction[], id: string, patch: Partial<PendingAction>): PendingAction[] {
  return actions.map((a) => (a.id === id ? { ...a, ...patch } : a))
}

/**
 * Out-of-order snapshots (2026-11-19): several reads run at once (the 10 s
 * safety net, a WebSocket hint, a push, an answer). A slow older one landing
 * after a newer one used to bring an answered offer back for a moment — and
 * ring again. A snapshot is applied only if the server produced it no earlier
 * than the one on screen.
 */
export function isNewerSnapshot(serverTime: string, lastAppliedMs: number | null): boolean {
  const at = Date.parse(serverTime)
  if (Number.isNaN(at)) return true
  return lastAppliedMs === null || at >= lastAppliedMs
}
