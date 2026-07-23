import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Logger,
  Post,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { timingSafeEqual } from 'node:crypto'
import type { AppConfig } from '../config/configuration'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import { TelegramService } from './telegram.service'
import type { TelegramUpdate } from './telegram.types'

/**
 * Receives every message sent to the bot. The only thing we act on is the
 * one-time `/start <token>` command a driver's Telegram client sends the
 * moment they tap their personal t.me deep-link — that's how we learn their
 * chat_id (Telegram gives no other way to message a user who hasn't
 * initiated contact with the bot).
 */
@Controller('telegram')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name)
  private readonly webhookSecret: string

  constructor(
    config: ConfigService,
    private readonly towTrucksRepository: TowTrucksRepository,
    private readonly telegram: TelegramService,
  ) {
    this.webhookSecret = config.getOrThrow<AppConfig['telegram']>('telegram').webhookSecret
  }

  @Post('webhook')
  @HttpCode(200)
  async handleUpdate(
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secretHeader?: string,
  ): Promise<{ ok: true }> {
    // Telegram echoes the secret we set via setWebhook on every call —
    // without this check anyone could POST fake updates to this endpoint.
    if (!this.secretMatches(secretHeader)) {
      throw new ForbiddenException('Invalid webhook secret')
    }

    const text = update.message?.text?.trim()
    const chatId = update.message?.chat.id

    if (!text || chatId === undefined) return { ok: true }

    if (text.startsWith('/start')) {
      await this.handleStart(text, chatId)
    }

    return { ok: true }
  }

  /** Constant-time compare — plain `!==` on a secret leaks timing info */
  private secretMatches(header: string | undefined): boolean {
    if (!header) return false
    const a = Buffer.from(header)
    const b = Buffer.from(this.webhookSecret)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  private async handleStart(text: string, chatId: number): Promise<void> {
    const token = text.replace('/start', '').trim()

    if (!token) {
      await this.telegram.sendMessage(
        chatId,
        'Այս bot-ը օգտագործվում է Evakuators.am-ի վրա գրանցված վարորդների համար։ Անձնական link-ի կարիք ունեք admin-ից։',
      )
      return
    }

    const towTruck = await this.towTrucksRepository.findByTelegramLinkToken(token)
    if (!towTruck) {
      await this.telegram.sendMessage(
        chatId,
        'Այս link-ը սխալ է կամ ժամկետանց։ Դիմեք Evakuators.am admin-ին նոր link ստանալու համար։',
      )
      return
    }

    await this.towTrucksRepository.linkTelegramChat(towTruck.id, BigInt(chatId))

    await this.telegram.sendMessage(
      chatId,
      `Բարև, ${towTruck.driverName}։ Ձեր Telegram-ը հաջողությամբ կապակցվեց Evakuators.am-ի հետ։ Այսուհետ մուտքի կոդերը կստանաք այստեղ։`,
    )
    this.logger.log(`Linked Telegram chat ${chatId} to TowTruck #${towTruck.id}`)
  }
}
