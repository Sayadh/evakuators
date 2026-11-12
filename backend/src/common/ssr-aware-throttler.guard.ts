import { createHmac, timingSafeEqual } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import type { ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'

/** The driver app's token audience (live-dispatch nest/auth.ts DRIVER_APP_AUDIENCE — not imported: that module is deletable) */
const DRIVER_APP_AUDIENCE = 'driver:app'

/**
 * The driver id of a VALID driver-app token (HS256, our secret, right audience,
 * not expired), or null. Only to choose a rate-limit bucket: the request is
 * still authenticated by DriverAppGuard as before. Verified, not just decoded,
 * so a forged token cannot mint itself a fresh bucket per request.
 */
export function driverIdForThrottle(authorization: string | undefined, secret: string, now = Date.now()): number | null {
  if (!secret || !authorization?.startsWith('Bearer ')) return null
  const parts = authorization.slice(7).trim().split('.')
  if (parts.length !== 3) return null
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as { alg?: string }
    if (header.alg !== 'HS256') return null
    const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest()
    const given = Buffer.from(parts[2], 'base64url')
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { sub?: unknown; aud?: unknown; exp?: unknown }
    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (!audience.includes(DRIVER_APP_AUDIENCE)) return null
    if (typeof payload.exp === 'number' && payload.exp * 1000 < now) return null
    const id = Number(payload.sub)
    return Number.isSafeInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

/** ::1 and the 127.0.0.0/8 range, in both bare and IPv4-mapped-IPv6 form */
const LOOPBACK = /^(::1|::ffff:127\.|127\.)/

/**
 * ThrottlerGuard that exempts requests originating from this machine.
 *
 * ## The problem this solves
 *
 * `ThrottlerGuard` buckets by `req.ip`, which is exactly right for browsers and
 * exactly wrong for server-side rendering: an SSR fetch is made by the Nuxt
 * process, not by the visitor, so every visitor's rendered page arrives at the
 * backend from the SAME address. All of them then share ONE 60-requests/minute
 * bucket, and since a single page render costs 2-3 API calls, the site starts
 * returning 429 to its own renderer at roughly 20-30 page views per minute —
 * site-wide, for everyone, no matter how many different people are browsing.
 *
 * ## Why matching on loopback is safe
 *
 * The backend binds to 127.0.0.1 (see main.ts), so the only way to open a
 * connection whose peer address is loopback is from inside the server itself —
 * i.e. our own Nitro process. Public traffic always arrives through nginx,
 * which appends the real client address to `X-Forwarded-For`; with
 * `trust proxy 1` Express resolves `req.ip` to that client, never to loopback.
 * So a visitor cannot forge their way in here: sending
 * `X-Forwarded-For: 127.0.0.1` only pushes the value left in the chain, where
 * a single-hop trust setting ignores it.
 *
 * This is why the frontend must point SSR at the loopback URL
 * (NUXT_INTERNAL_API_BASE_URL) rather than the public hostname — going out
 * through nginx and back would present the server's *public* address, which is
 * not loopback and would land in the shared bucket again.
 *
 * Note this removes rate limiting for SSR only. Every browser-originated
 * request, including the ones that matter (login, registration, uploads,
 * analytics), is still throttled exactly as before by its own client IP.
 */
@Injectable()
export class SsrAwareThrottlerGuard extends ThrottlerGuard {
  /**
   * A signed-in DRIVER is limited per driver, not per IP (2026-11-12 review).
   * Mobile operators put many phones behind one public address (carrier-grade
   * NAT): by IP, ten drivers on the same network share ONE 60-a-minute bucket
   * for the snapshot the app re-reads every 10 s — and all of them start
   * getting 429 together. Everything else (and an invalid token) stays by IP.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const driverId = driverIdForThrottle(req.headers?.authorization, process.env.DRIVER_JWT_SECRET ?? '')
    if (driverId !== null) return `driver:${driverId}`
    return super.getTracker(req)
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return super.shouldSkip(context)

    const request = context.switchToHttp().getRequest<Request>()
    if (LOOPBACK.test(request.ip ?? '')) return true

    return super.shouldSkip(context)
  }
}
