/**
 * Per-ACCOUNT brute-force guard for password sign-ins (2026-11-12 audit).
 *
 * The throttler limits sign-ins per IP address, which a botnet or a pool of
 * mobile IPs gets around; this limits wrong passwords per account, wherever
 * they come from: after MAX_FAILURES wrong passwords within WINDOW_MS the
 * account refuses sign-ins (even with the right password) until the window
 * has passed. A correct password resets the count.
 *
 * In memory, per API process: with several API instances each enforces its
 * own count (still a hard ceiling per instance). Restarting resets it.
 */
const MAX_FAILURES = 8
const WINDOW_MS = 15 * 60_000
const MAX_TRACKED = 50_000

interface Entry {
  failures: number
  firstAt: number
}

export class LoginAttemptLimiter {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly maxFailures = MAX_FAILURES,
    private readonly windowMs = WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Seconds until the account may try again, or 0 when it may try now */
  retryAfterSeconds(key: string): number {
    const entry = this.live(key)
    if (!entry || entry.failures < this.maxFailures) return 0
    return Math.max(1, Math.ceil((entry.firstAt + this.windowMs - this.now()) / 1000))
  }

  failed(key: string): void {
    const entry = this.live(key)
    if (entry) entry.failures++
    else {
      if (this.entries.size >= MAX_TRACKED) this.prune()
      this.entries.set(key, { failures: 1, firstAt: this.now() })
    }
  }

  succeeded(key: string): void {
    this.entries.delete(key)
  }

  private live(key: string): Entry | null {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (this.now() - entry.firstAt >= this.windowMs) {
      this.entries.delete(key)
      return null
    }
    return entry
  }

  private prune(): void {
    const now = this.now()
    for (const [key, entry] of this.entries) if (now - entry.firstAt >= this.windowMs) this.entries.delete(key)
    // Still full (an attack spraying many accounts): drop the oldest half
    if (this.entries.size >= MAX_TRACKED) {
      let n = 0
      for (const key of this.entries.keys()) {
        this.entries.delete(key)
        if (++n >= MAX_TRACKED / 2) break
      }
    }
  }
}

/** One limiter for every password sign-in in this process; keys are prefixed per surface */
export const loginAttempts = new LoginAttemptLimiter()

export const LOCKED_MESSAGE = (seconds: number) =>
  `Չափազանց շատ սխալ փորձեր այս հաշվի համար։ Փորձեք կրկին ${Math.ceil(seconds / 60)} րոպեից։`
