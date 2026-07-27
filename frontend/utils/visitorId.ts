import {
  VISITOR_ID_COOKIE_MAX_AGE_SECONDS,
  VISITOR_ID_COOKIE_NAME,
  VISITOR_ID_STORAGE_KEY,
} from '~/constants/analytics'

/**
 * The anonymous visitor identity used by provider analytics.
 *
 * ## What this is and is not
 *
 * It is a random UUID v4 with no relation to any person, account, IP or device
 * fingerprint. Its only job is to let the backend answer "have I already
 * counted this browser for this tow truck today?" — see docs/analytics.md.
 * There is no login requirement, and if the visitor clears cookies and storage
 * the next visit is legitimately a new visitor. That is a deliberate,
 * documented limitation, not a bug to work around: the alternative
 * (fingerprinting) would be both fragile and a real privacy intrusion for a
 * counter on a tow-truck listing.
 *
 * ## Why it's generated client-side
 *
 * The id must be stable across page loads, and the site is SSR'd — a
 * server-generated id would have to be sent as a Set-Cookie header on every
 * cached-ish page render, and the server would then be the second writer of a
 * value the client also writes. One writer, in the browser, is simpler and
 * keeps the backend completely stateless with respect to visitor identity.
 */

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Reads the id from cookie or localStorage, creating and persisting one on the
 * first visit. Returns null on the server — there is no visitor identity during
 * SSR, and tracking is a client-only concern.
 *
 * Stored values are validated against the UUID v4 shape before being reused: the
 * backend rejects anything else with a 400, so a corrupted or hand-edited value
 * would otherwise silently break tracking for that browser forever. Failing that
 * check just mints a fresh id.
 */
export function getOrCreateVisitorId(): string | null {
  if (!import.meta.client) return null

  const existing = readCookie() ?? readStorage()
  if (existing && UUID_V4_PATTERN.test(existing)) {
    // Re-persist on every read: refreshes the cookie's rolling expiry and heals
    // the case where only one of the two stores survived.
    persist(existing)
    return existing
  }

  const created = createUuidV4()
  persist(created)
  return created
}

function readCookie(): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${VISITOR_ID_COOKIE_NAME}=([^;]*)`),
  )
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function readStorage(): string | null {
  try {
    return localStorage.getItem(VISITOR_ID_STORAGE_KEY)
  } catch {
    // Private mode / storage disabled — tracking degrades to per-page-load
    // uniqueness rather than throwing on a public page.
    return null
  }
}

function persist(visitorId: string): void {
  // SameSite=Lax: never sent on cross-site requests, which is all this needs
  // (the id is read by our own script, not by a third party). Secure only over
  // HTTPS so it still works on http://localhost:3002 in development.
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie =
    `${VISITOR_ID_COOKIE_NAME}=${encodeURIComponent(visitorId)}` +
    `; Path=/; Max-Age=${VISITOR_ID_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`

  try {
    localStorage.setItem(VISITOR_ID_STORAGE_KEY, visitorId)
  } catch {
    // Cookie alone is enough — see readStorage()
  }
}

/**
 * `crypto.randomUUID()` is available in every browser this site supports, but
 * only in secure contexts. The fallback builds a spec-correct v4 from
 * `getRandomValues` (setting the version and variant bits by hand) rather than
 * `Math.random()`, so the value stays unguessable and passes the backend's
 * `@IsUUID('4')` validation either way.
 */
function createUuidV4(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // variant 10xx
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}
