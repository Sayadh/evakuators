/**
 * Offer countdown from the SERVER's clock, never the phone's.
 *
 * The API returns `expiresAt` and `serverTime` in the same response. The
 * offset between server and phone is measured once (at receipt) and applied
 * to every tick, so a phone whose clock is minutes off still shows the right
 * number of seconds — and never shows time the server will not honour.
 * The server still decides: an accept after the real deadline is refused.
 */
export interface ServerClock {
  /** serverTime − phoneTime at the moment the response arrived, ms */
  offsetMs: number
}

export function measureClock(serverTimeIso: string, receivedAtPhoneMs: number): ServerClock {
  const server = Date.parse(serverTimeIso)
  if (Number.isNaN(server)) return { offsetMs: 0 }
  return { offsetMs: server - receivedAtPhoneMs }
}

export function secondsLeft(expiresAtIso: string, clock: ServerClock, phoneNowMs: number): number {
  const expires = Date.parse(expiresAtIso)
  if (Number.isNaN(expires)) return 0
  const serverNow = phoneNowMs + clock.offsetMs
  // Floor, and subtract a 1 s safety margin: better to show 0 a moment early
  // than invite a tap the server will refuse as late.
  return Math.max(0, Math.floor((expires - serverNow) / 1000) - 1)
}
