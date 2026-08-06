import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/**
 * Turns the raw visitor id from the browser into the value actually stored.
 *
 * ## Why hash at all
 *
 * The raw id is a value living in the visitor's browser. Storing it in plain
 * text would mean a database dump (or an over-broad admin query) hands out
 * identifiers that can be correlated with any other system holding the same
 * cookie, and could in principle be replayed. Hashing with a server-side
 * pepper makes the stored key useless outside this database while preserving
 * the only property the feature needs: two requests from the same browser
 * produce the same key.
 *
 * It is a plain salt-less sha256 with a pepper, not bcrypt/argon2, and that is
 * intentional: this runs on every tracked event (hot path) and the input is a
 * 122-bit random UUID, not a guessable human secret — there is no dictionary to
 * attack, so a deliberately slow KDF would buy nothing and cost throughput.
 *
 * Same construction as the admin 2FA code hashing in AdminAuthService
 * (`sha256(code + secret)`), so the codebase has one convention for "hash a
 * short-lived opaque token". Driver passwords are deliberately NOT in that
 * family — they are a guessable human secret, so they get bcrypt.
 */
@Injectable()
export class AnalyticsVisitorKeyService {
  private readonly pepper: string

  constructor(config: ConfigService) {
    this.pepper = config.getOrThrow<string>('analyticsVisitorPepper')
  }

  /** Stable per browser, meaningless outside this database */
  hash(rawVisitorId: string): string {
    return createHash('sha256').update(`${rawVisitorId}${this.pepper}`).digest('hex')
  }
}
