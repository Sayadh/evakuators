import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { createHash, randomInt } from 'node:crypto'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import { TelegramService } from '../telegram/telegram.service'
import { DriverOtpRepository } from './driver-otp.repository'

const CODE_TTL_MINUTES = 5
const MAX_ATTEMPTS = 5
const REQUEST_COOLDOWN_MS = 45_000

export interface DriverSession {
  token: string
  towTruckId: number
  slug: string
}

@Injectable()
export class DriverAuthService {
  private readonly pepper: string
  /** phone -> last request time, resets on restart — fine for a single-instance app */
  private readonly lastRequestAt = new Map<string, number>()

  constructor(
    private readonly towTrucksRepository: TowTrucksRepository,
    private readonly otpRepository: DriverOtpRepository,
    private readonly telegram: TelegramService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.pepper = config.getOrThrow<string>('driverJwtSecret')
  }

  async requestCode(phone: string): Promise<void> {
    const lastAt = this.lastRequestAt.get(phone)
    if (lastAt && Date.now() - lastAt < REQUEST_COOLDOWN_MS) {
      throw new BadRequestException('Խնդրում ենք սպասել մի քանի վայրկյան նոր կոդ խնդրելուց առաջ')
    }

    const towTruck = await this.towTrucksRepository.findByPhone(phone)
    if (!towTruck) {
      throw new NotFoundException('Այս հեռախոսահամարով պրոֆիլ չի գտնվել')
    }
    if (!towTruck.telegramChatId) {
      throw new BadRequestException(
        'Ձեր Telegram-ը դեռ կապակցված չէ։ Դիմեք admin-ին անձնական link ստանալու համար։',
      )
    }

    this.lastRequestAt.set(phone, Date.now())

    const code = randomInt(100_000, 1_000_000).toString()
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000)
    await this.otpRepository.create(towTruck.id, this.hashCode(code), expiresAt)

    await this.telegram.sendMessage(
      towTruck.telegramChatId,
      `Ձեր մուտքի կոդն է՝ ${code}\n\nԿոդը վավեր է ${CODE_TTL_MINUTES} րոպե։ Եթե դուք չեք խնդրել այս կոդը, անտեսեք այս հաղորդագրությունը։`,
    )
  }

  async verifyCode(phone: string, code: string): Promise<DriverSession> {
    const towTruck = await this.towTrucksRepository.findByPhone(phone)
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

    if (otp.codeHash !== this.hashCode(code)) {
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
}
