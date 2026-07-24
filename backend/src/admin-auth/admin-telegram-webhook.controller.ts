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
import type { TelegramUpdate } from '../telegram/telegram.types'
import { AdminTelegramService } from './admin-telegram.service'
import { AdminUserRepository } from './admin-user.repository'

/**
 * Receives updates for the dedicated ADMIN bot (separate from the driver
 * bot's webhook — see telegram-webhook.controller.ts). Same shape and same
 * lessons learned: only `/start <token>` matters, and every branch is
 * wrapped so a bug here can never surface as a failed HTTP response (which
 * would make Telegram mark the update undelivered and the admin gets no
 * reply at all — see docs/auth-and-security.md for the incident this
 * pattern was born from, on the driver bot).
 */
@Controller('admin-telegram')
export class AdminTelegramWebhookController {
  private readonly logger = new Logger(AdminTelegramWebhookController.name)
  private readonly webhookSecret: string
  private readonly allowedChatIds: string[]

  constructor(
    config: ConfigService,
    private readonly adminUserRepository: AdminUserRepository,
    private readonly telegram: AdminTelegramService,
  ) {
    const adminTelegram = config.getOrThrow<AppConfig['adminTelegram']>('adminTelegram')
    this.webhookSecret = adminTelegram.webhookSecret
    this.allowedChatIds = adminTelegram.allowedChatIds
  }

  @Post('webhook')
  @HttpCode(200)
  async handleUpdate(
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secretHeader?: string,
  ): Promise<{ ok: true }> {
    if (!this.secretMatches(secretHeader)) {
      throw new ForbiddenException('Invalid webhook secret')
    }

    const chatId = update.message?.chat.id

    // Locked down to specific Telegram accounts (ADMIN_TELEGRAM_ALLOWED_CHAT_IDS)
    // — checked before anything else, even a valid /start link token, so an
    // unauthorized chat gets no reaction at all: no reply, no DB lookup,
    // nothing that reveals this bot does anything. Only a server-side log.
    if (chatId !== undefined && !this.isChatAllowed(chatId)) {
      this.logger.warn(`Ignored Telegram update from disallowed chat ${chatId}`)
      return { ok: true }
    }

    const text = update.message?.text?.trim()
    if (!text || chatId === undefined) return { ok: true }

    if (text.startsWith('/start')) {
      try {
        await this.handleStart(text, chatId)
      } catch (error) {
        const err = error as Error
        this.logger.error(`handleStart failed for chat ${chatId}: ${err.message}`, err.stack)
        await this.telegram
          .sendMessage(chatId, 'Ինչ-որ խնդիր առաջացավ։ Փորձեք կրկին կամ ստուգեք server-ի logs-ը։')
          .catch(() => undefined)
      }
    }

    return { ok: true }
  }

  /** Constant-time compare — plain `!==` on a secret leaks timing info */
  private secretMatches(header: string | undefined): boolean {
    if (!header || !this.webhookSecret) return false
    const a = Buffer.from(header)
    const b = Buffer.from(this.webhookSecret)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  /** Empty list = unrestricted, preserving the feature's "optional" default */
  private isChatAllowed(chatId: number): boolean {
    if (this.allowedChatIds.length === 0) return true
    return this.allowedChatIds.includes(String(chatId))
  }

  private async handleStart(text: string, chatId: number): Promise<void> {
    const token = text.replace('/start', '').trim()

    if (!token) {
      this.logger.warn(`/start with no token from chat ${chatId} (raw text: "${text}")`)
      await this.telegram.sendMessage(
        chatId,
        'Այս bot-ը օգտագործվում է Evakuators.am admin-ի 2-քայլանոց մուտքի համար։ ' +
          'Անհրաժեշտ է անհատական link, որը սերվերում գեներացվում է npm run admin:telegram-link հրամանով։',
      )
      return
    }

    const admin = await this.adminUserRepository.findByTelegramLinkToken(token)
    if (!admin) {
      this.logger.warn(`/start token not found or expired: "${token}" (chat ${chatId})`)
      await this.telegram.sendMessage(
        chatId,
        'Այս link-ը սխալ է կամ ժամկետանց։ Գեներացրեք նորը սերվերից՝ npm run admin:telegram-link հրամանով։',
      )
      return
    }

    await this.adminUserRepository.linkTelegramChat(admin.id, BigInt(chatId))

    await this.telegram.sendMessage(
      chatId,
      `Բարև։ Ձեր admin հաշիվը (${admin.email}) հաջողությամբ կապակցվեց այս bot-ին։ ` +
        'Այսուհետ մուտքի կոդերը և նոր հայտերի մասին ծանուցումները կստանաք այստեղ։',
      { text: 'Բացել admin վահանակը', url: this.telegram.adminPanelUrl },
    )
    this.logger.log(`Linked Telegram chat ${chatId} to admin User #${admin.id}`)
  }
}
