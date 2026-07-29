import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import type { ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'

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
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return super.shouldSkip(context)

    const request = context.switchToHttp().getRequest<Request>()
    if (LOOPBACK.test(request.ip ?? '')) return true

    return super.shouldSkip(context)
  }
}
