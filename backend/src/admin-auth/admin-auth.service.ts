import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import bcrypt from 'bcrypt'
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { AdminOtpRepository } from './admin-otp.repository'
import { AdminTelegramService } from './admin-telegram.service'
import { AdminUserRepository } from './admin-user.repository'

const TOKEN_TTL = '24h'
const CODE_TTL_MINUTES = 5
const MAX_ATTEMPTS = 5

// Used when no matching admin exists, so login() always pays the same
// bcrypt.compare() cost — otherwise "unknown email" responds measurably
// faster than "wrong password" and an attacker can enumerate valid emails.
const DUMMY_HASH = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8G8Kn8UYwUIQEEcxJp/nDdX7O/HgFa'

export interface AdminSession {
  token: string
}

/**
 * `requiresCode: false` means the password alone was enough (the admin
 * hasn't linked Telegram yet, see `npm run admin:telegram-link` — a fresh
 * account must never be permanently locked out). Once linked, every login
 * returns `requiresCode: true` and the frontend must call verifyCode() next.
 */
export type AdminLoginResult = { requiresCode: true } | ({ requiresCode: false } & AdminSession)

@Injectable()
export class AdminAuthService {
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
      const token = await this.jwt.signAsync(
        { sub: user.id, role: user.role },
        { secret: this.secret, expiresIn: TOKEN_TTL },
      )
      return { requiresCode: false, token }
    }

    await this.otpRepository.invalidateActive(user.id)

    const code = randomInt(100_000, 1_000_000).toString()
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000)
    await this.otpRepository.create(user.id, this.hashCode(code), expiresAt)

    await this.telegram.sendMessage(
      user.telegramChatId,
      `Ձեր admin մուտքի կոդն է՝ ${code}\n\nԿոդը վավեր է ${CODE_TTL_MINUTES} րոպե։ Եթե դուք չեք փորձել ` +
        'մուտք գործել, խորհուրդ ենք տալիս անմիջապես փոխել գաղտնաբառը։',
    )

    return { requiresCode: true }
  }

  async verifyCode(email: string, code: string): Promise<AdminSession> {
    const user = await this.adminUserRepository.findAdminByEmail(email)
    if (!user) {
      throw new UnauthorizedException('Սխալ email կամ գաղտնաբառ')
    }

    const otp = await this.otpRepository.findActive(user.id)
    if (!otp) {
      throw new BadRequestException('Կոդը ժամկետանց է կամ գոյություն չունի, մուտք գործեք նորից email-ով ու գաղտնաբառով')
    }

    if (otp.attempts >= MAX_ATTEMPTS) {
      await this.otpRepository.consume(otp.id)
      throw new BadRequestException('Չափազանց շատ սխալ փորձեր, մուտք գործեք նորից email-ով ու գաղտնաբառով')
    }

    if (!this.hashesMatch(otp.codeHash, this.hashCode(code))) {
      await this.otpRepository.incrementAttempts(otp.id)
      throw new UnauthorizedException('Սխալ կոդ')
    }

    await this.otpRepository.consume(otp.id)

    const token = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { secret: this.secret, expiresIn: TOKEN_TTL },
    )

    return { token }
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
