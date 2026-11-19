/**
 * Problem alerts (2026-11-16, owner's decision): an Online driver (or one with
 * an active order) who has lost his connection or his GPS is TOLD, with a
 * sound, what is wrong and what to do — once the grace below has passed, then every
 * PROBLEM_ALERT_EVERY_SECONDS, at most PROBLEM_ALERT_MAX times per problem.
 * A new problem (or the same one after it cleared) starts over.
 *
 * What the server can see:
 * - CONNECTION — no heartbeat for longer than the console's «Կապ չկա» limit
 *   plus the time the silent wake push (PushService.wakeStaleDrivers) had to
 *   fix it. The phone has internet but the app is not answering: «open it».
 * - GPS — the app answers, but no fix is fresh: location off, or the phone
 *   cannot see the sky.
 * «No internet at all» the server cannot tell anyone: the phone says it
 * itself (mobile/src/location/tracking.ts).
 *
 * Pure: the worker feeds it rows and does the writing and sending.
 */
export type ProblemReason = 'CONNECTION' | 'GPS'

/** Once an hour (2026-11-18, owner's decision; was every 5 minutes): told, not nagged */
export const PROBLEM_ALERT_EVERY_SECONDS = 3600
export const PROBLEM_ALERT_MAX = 3
/**
 * On top of heartbeatMaxAgeSeconds: the wake push gets this long to work
 * first. 3 minutes (2026-11-18): a locked phone lying still drops into
 * Android's deep Doze, the app goes quiet for a few minutes and the wake push
 * brings it back by itself — an alert in that window was a false alarm the
 * driver could do nothing about. A phone that is really off or offline is
 * still reported, just ~2 minutes later.
 */
export const CONNECTION_GRACE_SECONDS = 180
/** On top of gpsMaxAgeSeconds: a Doze window without a fix is not a problem yet (same reasoning, 2026-11-18) */
export const GPS_GRACE_SECONDS = 180

export interface ProblemInput {
  heartbeatAgeSeconds: number | null
  gpsAgeSeconds: number | null
  stored: { reason: string | null; count: number; lastAtAgeSeconds: number | null }
}

export interface ProblemRules {
  heartbeatMaxAgeSeconds: number
  gpsMaxAgeSeconds: number
}

export function currentProblem(input: Pick<ProblemInput, 'heartbeatAgeSeconds' | 'gpsAgeSeconds'>, rules: ProblemRules): ProblemReason | null {
  if (input.heartbeatAgeSeconds === null) return null // never connected this session: nothing was lost
  if (input.heartbeatAgeSeconds > rules.heartbeatMaxAgeSeconds + CONNECTION_GRACE_SECONDS) return 'CONNECTION'
  // Going stale: the wake push is working on it — and an old fix from a
  // sleeping phone says nothing about its GPS yet
  if (input.heartbeatAgeSeconds > rules.heartbeatMaxAgeSeconds) return null
  if (input.gpsAgeSeconds === null || input.gpsAgeSeconds > rules.gpsMaxAgeSeconds + GPS_GRACE_SECONDS) return 'GPS'
  return null
}

export type ProblemDecision =
  | { kind: 'none' }
  | { kind: 'clear' }
  | { kind: 'send'; reason: ProblemReason; count: number }

export function decideProblemAlert(input: ProblemInput, rules: ProblemRules): ProblemDecision {
  const reason = currentProblem(input, rules)
  if (reason === null) return input.stored.reason !== null || input.stored.count > 0 ? { kind: 'clear' } : { kind: 'none' }
  const same = input.stored.reason === reason
  const count = same ? input.stored.count : 0
  if (count >= PROBLEM_ALERT_MAX) return { kind: 'none' }
  if (same && input.stored.lastAtAgeSeconds !== null && input.stored.lastAtAgeSeconds < PROBLEM_ALERT_EVERY_SECONDS) return { kind: 'none' }
  return { kind: 'send', reason, count: count + 1 }
}
