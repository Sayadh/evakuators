import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Cron, CronExpression } from '@nestjs/schedule'
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { AdminOtpRepository } from '../admin-auth/admin-otp.repository'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import { TelegramService } from '../telegram/telegram.service'
import { DriverOtpRepository } from './driver-otp.repository'

const CODE_TTL_MINUTES = 5
const MAX_ATTEMPTS = 5
const REQUEST_COOLDOWN_MS = 45_000

/**
 * How long a login code row is kept before deletion. Far beyond the 5-minute
 * TTL — the point is only to stop the table growing forever, not to expire codes
 * (that's `expiresAt`).
 */
const OTP_RETENTION_MS = 24 * 60 * 60 * 1000

export interface DriverSession {
  token: string
  towTruckId: number
  slug: string
}

@Injectable()
export class DriverAuthService {
  private readonly logger = new Logger(DriverAuthService.name)
  private readonly pepper: string
  /**
   * phone -> last request time, resets on restart — fine for a single-instance
   * app. Swept in purgeSpentLoginCodes() so it cannot grow without bound: the
   * cooldown is checked BEFORE the truck is looked up, so an entry is created
   * for every phone number ever posted to this endpoint, existing or not.
   */
  private readonly lastRequestAt = new Map<string, number>()

  constructor(
    private readonly towTrucksRepository: TowTrucksRepository,
    private readonly otpRepository: DriverOtpRepository,
    private readonly adminOtpRepository: AdminOtpRepository,
    private readonly telegram: TelegramService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.pepper = config.getOrThrow<string>('driverJwtSecret')
  }

  /**
   * Deletes spent login codes for both drivers and admins.
   *
   * One cron for both tables rather than one per auth module: they are the same
   * mechanism with the same retention rule, and a single scheduled job that
   * cannot get out of sync beats two that can. It lives here (rather than in a
   * "maintenance" grab-bag module) because driver OTPs are by far the higher
   * volume of the two.
   *
   * A row is dead the moment it expires or is consumed — the hash is one-way, so
   * keeping it has no audit value either.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeSpentLoginCodes(): Promise<void> {
    const cutoff = new Date(Date.now() - OTP_RETENTION_MS)
    const [drivers, admins] = await Promise.all([
      this.otpRepository.deleteExpiredBefore(cutoff),
      this.adminOtpRepository.deleteExpiredBefore(cutoff),
    ])

    if (drivers > 0 || admins > 0) {
      this.logger.log(`Login-code purge: removed ${drivers} driver and ${admins} admin codes`)
    }

    this.sweepCooldowns()
  }

  /**
   * Drops cooldown entries that can no longer block anything. An entry older
   * than REQUEST_COOLDOWN_MS is already inert — keeping it only costs memory,
   * and this map is fed by a public endpoint that does not require the phone
   * number to exist.
   */
  private sweepCooldowns(): void {
    const cutoff = Date.now() - REQUEST_COOLDOWN_MS
    for (const [phone, at] of this.lastRequestAt) {
      if (at < cutoff) this.lastRequestAt.delete(phone)
    }
  }

  async requestCode(phone: string): Promise<void> {
    const lastAt = this.lastRequestAt.get(phone)
    if (lastAt && Date.now() - lastAt < REQUEST_COOLDOWN_MS) {
      throw new BadRequestException('Խնդրում ենք սպասել մի քանի վայրկյան նոր կոդ խնդրելուց առաջ')
    }

    const towTruck = await this.towTrucksRepository.findActiveByMainPhone(phone)
    if (!towTruck) {
      throw new NotFoundException('Այս հեռախոսահամարով պրոֆիլ չի գտնվել')
    }
    if (!towTruck.telegramChatId) {
      throw new BadRequestException(
        'Ձեր Telegram-ը դեռ կապակցված չէ։ Դիմեք admin-ին անձնական link ստանալու համար։',
      )
    }

    this.lastRequestAt.set(phone, Date.now())

    // Only the code we're about to send should ever be valid — otherwise a
    // driver who scrolls back to an older Telegram message (or double-taps
    // "send code") could enter a still-technically-unexpired older code and
    // land in a confusing "wrong code" / mismatched state.
    await this.otpRepository.invalidateActive(towTruck.id)

    const code = randomInt(100_000, 1_000_000).toString()
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000)
    await this.otpRepository.create(towTruck.id, this.hashCode(code), expiresAt)

    await this.telegram.sendMessage(
      towTruck.telegramChatId,
      `Ձեր մուտքի կոդն է՝ ${code}\n\nԿոդը վավեր է ${CODE_TTL_MINUTES} րոպե։ Եթե դուք չեք խնդրել այս կոդը, անտեսեք այս հաղորդագրությունը։`,
      { text: 'Մուտք գործել', url: this.telegram.loginUrl },
    )
  }

  async verifyCode(phone: string, code: string): Promise<DriverSession> {
    const towTruck = await this.towTrucksRepository.findActiveByMainPhone(phone)
    if (!towTruck) {
      throw new NotFoundException('Այս հեռախոսահամարով պրոֆիլ չի գտնվել')
    }

    const otp = await this.otpRepository.findActive(towTruck.id)
    if (!otp) {
      throw new BadRequestException('Կոդը ժամկետանց է կամ գոյություն չունի, խնդրեք նոր կոդ')
    }

    if (otp.attempts >= MAX_ATTEMPTS) {
      await this.otpRepository.consume(otp.id)
      throw new BadRequestException('Չափազանց շատ սխալ փորձեր, խնդրեք նոր կոդ')
    }

    if (!this.hashesMatch(otp.codeHash, this.hashCode(code))) {
      await this.otpRepository.incrementAttempts(otp.id)
      throw new UnauthorizedException('Սխալ կոդ')
    }

    await this.otpRepository.consume(otp.id)

    const token = await this.jwt.signAsync(
      { sub: towTruck.id },
      { secret: this.pepper, expiresIn: '30d' },
    )

    return { token, towTruckId: towTruck.id, slug: towTruck.slug }
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(`${code}:${this.pepper}`).digest('hex')
  }

  /** Constant-time compare — plain `!==` on secrets leaks timing info */
  private hashesMatch(a: string, b: string): boolean {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
  }
}
