/**
 * Bounded offline buffer of GPS fixes.
 *
 * - Bounded: at most `max` fixes; the OLDEST are dropped first (a fix from an
 *   hour ago is the least useful one to keep).
 * - Ordered by `seq`; duplicates are ignored.
 * - Sent in chunks of ≤ 50 (the API limit), oldest first, so the server sees
 *   history in order and only the newest FRESH fix can become "now".
 * - The server decides what is current; the app never "re-dates" a fix.
 */
export interface Fix {
  seq: number
  latitude: number
  longitude: number
  accuracyM: number
  measuredAt: string
  speedMps?: number | null
  headingDeg?: number | null
}

export const MAX_BUFFERED_FIXES = 300
export const MAX_FIXES_PER_REQUEST = 50

export function addFixes(buffer: Fix[], incoming: Fix[], max = MAX_BUFFERED_FIXES): Fix[] {
  const bySeq = new Map<number, Fix>()
  for (const fix of buffer) bySeq.set(fix.seq, fix)
  for (const fix of incoming) if (!bySeq.has(fix.seq)) bySeq.set(fix.seq, fix)
  const sorted = [...bySeq.values()].sort((a, b) => a.seq - b.seq)
  return sorted.length > max ? sorted.slice(sorted.length - max) : sorted
}

export function nextChunk(buffer: Fix[]): Fix[] {
  return buffer.slice(0, MAX_FIXES_PER_REQUEST)
}

/** After a successful send: drop what the server acknowledged (accepted OR rejected — both are final) */
export function removeSent(buffer: Fix[], sent: Fix[]): Fix[] {
  const done = new Set(sent.map((f) => f.seq))
  return buffer.filter((f) => !done.has(f.seq))
}
