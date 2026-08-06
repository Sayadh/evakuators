import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Cron, CronExpression } from '@nestjs/schedule'
import { UserRole } from '@prisma/client'
import bcrypt from 'bcrypt'
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { AdminOtpRepository } from './admin-otp.repository'
import { ADMIN_2FA_AUDIENCE, ADMIN_SESSION_AUDIENCE } from './admin-token.audience'
import { AdminTelegramService } from './admin-telegram.service'
import { AdminUserRepository } from './admin-user.repository'

const TOKEN_TTL = '24h'
const CODE_TTL_MINUTES = 5
const MAX_ATTEMPTS = 5

// Used when no matching admin exists, so login() always pays the same
// bcrypt.compare() cost — otherwise "unknown email" responds measurably
// faster than "wrong password" and an attacker can enumerate valid emails.
const DUMMY_HASH = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8G8Kn8UYwUIQEEcxJp/nDdX7O/HgFa'

/**
 * How long the proof-of-password token stays usable. Matches the OTP's own
 * TTL — there is nothing to prove once the code it points at has expired.
 */
const PENDING_TOKEN_TTL_SECONDS = CODE_TTL_MINUTES * 60

/**
 * How long a login code row is kept before deletion. Far beyond the 5-minute
 * TTL — the point is only to stop the table growing forever, not to expire
 * codes (that is `expiresAt`).
 */
const OTP_RETENTION_MS = 24 * 60 * 60 * 1000

export interface AdminSession {
  token: string
}

/**
 * Payload of the step-1 token. `otpId` is what binds it to ONE challenge:
 * without it, "this request passed the password check" would be all the token
 * said, and it would still be usable against whatever OTP happened to be
 * active for that account later.
 */
interface AdminPendingPayload {
  sub: number
  otpId: number
}

/**
 * `requiresCode: false` means the password alone was enough (the admin
 * hasn't linked Telegram yet, see `npm run admin:telegram-link` — a fresh
 * account must never be permanently locked out). Once linked, every login
 * returns `requiresCode: true` plus a short-lived `pendingToken`, which the
 * frontend must send back to verifyCode() together with the code.
 */
export type AdminLoginResult =
  | { requiresCode: true; pendingToken: string; expiresInSeconds: number }
  | ({ requiresCode: false } & AdminSession)

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name)
  private readonly secret: string

  constructor(
    private readonly adminUserRepository: AdminUserRepository,
    private readonly otpRepository: AdminOtpRepository,
    private readonly telegram: AdminTelegramService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('adminJwtSecret')
  }

  /**
   * Deletes spent 2FA codes.
   *
   * Lived in DriverAuthService while there were two OTP tables to sweep — one
   * cron for both beat two that could drift apart. Drivers use passwords now,
   * `DriverOtp` is gone, and this is left next to the only table it still has
   * to clean.
   *
   * A row is dead the moment it expires or is consumed: the hash is one-way, so
   * keeping it has no audit value either.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeSpentLoginCodes(): Promise<void> {
    const removed = await this.otpRepository.deleteExpiredBefore(
      new Date(Date.now() - OTP_RETENTION_MS),
    )
    if (removed > 0) this.logger.log(`Login-code purge: removed ${removed} admin codes`)
  }

  async login(email: string, password: string): Promise<AdminLoginResult> {
    const user = await this.adminUserRepository.findAdminByEmail(email)

    const isValid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
    if (!user || !isValid) {
      throw new UnauthorizedException('Սխալ email կամ գաղտնաբառ')
    }

    // 2FA only kicks in once the admin has actually linked their Telegram —
    // until then, stay single-factor so a freshly `admin:create`-d account
    // is never locked out before it's had a chance to link.
    if (!user.telegramChatId) {
      return { requiresCode: false, token: await this.signSession(user.id, user.role) }
    }

    await this.otpRepository.invalidateActive(user.id)

    const code = randomInt(100_000, 1_000_000).toString()
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000)
    const otp = await this.otpRepository.create(user.id, this.hashCode(code), expiresAt)

    await this.telegram.sendMessage(
      user.telegramChatId,
      `Ձեր admin մուտքի կոդն է՝ ${code}\n\nԿոդը վավեր է ${CODE_TTL_MINUTES} րոպե։ Եթե դուք չեք փորձել ` +
        'մուտք գործել, խորհուրդ ենք տալիս անմիջապես փոխել գաղտնաբառը։',
    )

    // Step 1's proof, bound to the challenge just created. The second step
    // used to take an email, which identifies but proves nothing — the
    // password played no part in it at all.
    const pendingToken = await this.jwt.signAsync(
      { sub: user.id, otpId: otp.id } satisfies AdminPendingPayload,
      {
        secret: this.secret,
        audience: ADMIN_2FA_AUDIENCE,
        expiresIn: PENDING_TOKEN_TTL_SECONDS,
      },
    )

    return { requiresCode: true, pendingToken, expiresInSeconds: PENDING_TOKEN_TTL_SECONDS }
  }

  async verifyCode(pendingToken: string, code: string): Promise<AdminSession> {
    // The audience is passed to verify, so a full session token — same secret,
    // same signature algorithm — cannot be presented here as proof of the
    // password step. The mirror of this check lives in AdminJwtGuard.
    let payload: AdminPendingPayload
    try {
      payload = await this.jwt.verifyAsync<AdminPendingPayload>(pendingToken, {
        secret: this.secret,
        audience: ADMIN_2FA_AUDIENCE,
      })
    } catch {
      throw new UnauthorizedException(
        'Մուտքի նստաշրջանը սպառվել է, մուտք գործեք նորից email-ով ու գաղտնաբառով',
      )
    }

    // THE challenge this token was issued for — not "the newest active OTP for
    // this account". The difference is the whole point: the old lookup was by
    // user, so anyone who knew the email could aim at whatever code happened
    // to be live.
    const otp = await this.otpRepository.findById(payload.otpId)
    if (!otp || otp.userId !== payload.sub) {
      throw new UnauthorizedException('Մուտքի նստաշրջանը սպառվել է, մուտք գործեք նորից')
    }
    if (otp.consumedAt || otp.expiresAt <= new Date()) {
      throw new BadRequestException(
        'Կոդը ժամկետանց է կամ արդեն օգտագործված, մուտք գործեք նորից email-ով ու գաղտնաբառով',
      )
    }

    if (!this.hashesMatch(otp.codeHash, this.hashCode(code))) {
      // Atomic: the limit is enforced inside the UPDATE, so N concurrent wrong
      // guesses cannot all read the same pre-limit counter and slip past it.
      const allowed = await this.otpRepository.registerFailedAttempt(
        otp.id,
        payload.sub,
        MAX_ATTEMPTS,
      )
      if (!allowed) {
        throw new BadRequestException('Չափազանց շատ սխալ փորձեր, մուտք գործեք նորից')
      }
      throw new UnauthorizedException('Սխալ կոդ')
    }

    // The claim, not a check. Reading the row above and consuming it here as
    // two steps would let two requests carrying the same token and the same
    // correct code both be issued a session from one second factor. Exactly
    // one caller gets `true`.
    //
    // Note this is also what makes the pending token one-time: its challenge
    // is now consumed, so a replay lands on the `otp.consumedAt` check above.
    const claimed = await this.otpRepository.consumeIfUnused(otp.id, payload.sub, MAX_ATTEMPTS)
    if (!claimed) {
      throw new BadRequestException(
        'Կոդը ժամկետանց է, արդեն օգտագործված կամ արգելափակված, մուտք գործեք նորից',
      )
    }

    const user = await this.adminUserRepository.findById(payload.sub)
    if (!user) {
      throw new UnauthorizedException('Հաշիվը չի գտնվել')
    }

    return { token: await this.signSession(user.id, user.role) }
  }

  /**
   * The ONLY place a full admin session token is signed — both login branches
   * and verifyCode() go through it, so the audience can never be attached to
   * one and forgotten on another.
   */
  private signSession(userId: number, role: UserRole): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, role },
      { secret: this.secret, audience: ADMIN_SESSION_AUDIENCE, expiresIn: TOKEN_TTL },
    )
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(`${code}:${this.secret}`).digest('hex')
  }

  /** Constant-time compare — plain `!==` on secrets leaks timing info */
  private hashesMatch(a: string, b: string): boolean {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
  }
}
