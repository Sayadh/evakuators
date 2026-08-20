import { createHmac } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'

/**
 * The maximum User-Agent we will store.
 *
 * A User-Agent is a header the client controls entirely, so an unbounded column
 * is an invitation to write megabytes into an audit table one request at a
 * time. 512 characters holds every real browser's string several times over —
 * the longest ones in the wild are around 200.
 */
const USER_AGENT_MAX_LENGTH = 512

export interface ConsentRequestContext {
  ipHash: string | null
  userAgent: string | null
}

/**
 * Turns the incoming request into the two forensic fields a consent record
 * keeps — and into nothing else.
 *
 * ## The IP is hashed, not stored
 *
 * An IP address is personal data. Storing it in plain text would mean the table
 * whose entire purpose is data-protection compliance is itself an unnecessary
 * store of personal data, which is the kind of irony that shows up in an audit.
 * What an audit actually needs from it is much weaker than the address: the
 * ability to say "these two consents came from the same place", and the ability
 * to answer a challenge about one specific request when the address is supplied
 * from outside. A keyed hash gives both and gives nothing else away.
 *
 * ## HMAC, not `sha256(ip + pepper)`
 *
 * `AnalyticsVisitorKeyService` uses the concatenated form, and that is right
 * *there*: its input is a 122-bit random UUID, so there is no space to search
 * even if both the table and the pepper leaked. An IPv4 address has 2^32
 * possible values. Against a plain digest, an attacker holding a dump and the
 * pepper enumerates the entire space in minutes — and concatenation is also
 * vulnerable to length-extension in a way a keyed construction is not. HMAC
 * costs the same and removes both problems, so this is the one place in the
 * codebase that deviates from that convention, deliberately.
 *
 * ## Why a missing address is null and not a placeholder
 *
 * `req.ip` can legitimately be undefined. A null column means "not captured",
 * which is an honest record; hashing the empty string would produce a real-
 * looking value that every uncaptured request shares, i.e. a fabricated
 * observation that would make unrelated consents appear to come from one place.
 */
@Injectable()
export class ConsentRequestContextService {
  private readonly secret: string

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('privacyConsentIpSecret')
  }

  from(request: Request): ConsentRequestContext {
    // `req.ip` and not `req.socket.remoteAddress`: the app runs behind nginx
    // with `trust proxy 1` (see main.ts), so Express has already resolved this
    // to the real client rather than to the proxy. Reading the socket directly
    // would hash nginx's address for every single driver — one value for
    // everyone, which is the same as storing nothing while looking like data.
    const ip = request.ip
    const userAgent = request.headers['user-agent']

    return {
      ipHash: ip ? createHmac('sha256', this.secret).update(ip, 'utf8').digest('hex') : null,
      userAgent:
        typeof userAgent === 'string' && userAgent.length > 0
          ? userAgent.slice(0, USER_AGENT_MAX_LENGTH)
          : null,
    }
  }
}
