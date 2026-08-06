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
import { DriverAuthService } from '../driver-auth/driver-auth.service'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import { TelegramService } from './telegram.service'
import { telegramTokenFingerprint } from './token-fingerprint'
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
    private readonly driverAuth: DriverAuthService,
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
      try {
        await this.handleStart(text, chatId)
      } catch (error) {
        // A bug here must never surface as a failed HTTP response — Telegram
        // records that as a failed delivery (visible in getWebhookInfo's
        // last_error_message) and the driver receives NO reply whatsoever,
        // not even an error message. This exact scenario happened once
        // already (telegramChatId unique-constraint violation in
        // linkTelegramChat, see tow-trucks.repository.ts). Always ack
        // Telegram with 200 and tell the driver *something* broke, while
        // logging the real error for `pm2 logs`.
        const err = error as Error
        this.logger.error(`handleStart failed for chat ${chatId}: ${err.message}`, err.stack)
        await this.telegram
          .sendMessage(
            chatId,
            'Ինչ-որ խնդիր առաջացավ։ Խնդրում ենք փորձել կրկին, կամ դիմել Evakuators.am admin-ին։',
          )
          .catch(() => undefined) // even the fallback message might fail to send — don't let that throw either
      }
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
      this.logger.warn(`/start with no token from chat ${chatId} (raw text: "${text}")`)
      await this.telegram.sendMessage(
        chatId,
        'Այս bot-ը օգտագործվում է Evakuators.am-ի վրա գրանցված վարորդների համար։ Անձնական link-ի կարիք ունեք admin-ից։',
      )
      return
    }

    const towTruck = await this.towTrucksRepository.findByTelegramLinkToken(token)
    if (!towTruck) {
      // Fingerprint, not the token. This line is fed by world-writable input
      // (anyone can /start the bot with any text), and a rejected token is
      // still a credential-shaped string — it may well be a real, live token
      // that simply reached the wrong environment (see docs/local-development.md
      // on the single global webhook). Same function AdminService logs with, so
      // the two fingerprints are directly comparable.
      this.logger.warn(
        `/start token not found or expired: fp=${telegramTokenFingerprint(token)} (chat ${chatId})`,
      )
      await this.telegram.sendMessage(
        chatId,
        'Այս link-ը սխալ է կամ ժամկետանց։ Դիմեք Evakuators.am admin-ին նոր link ստանալու համար։',
      )
      return
    }

    await this.towTrucksRepository.linkTelegramChat(towTruck.id, BigInt(chatId))

    // The one channel we have for handing a driver their first password, which
    // is why it happens here and not at approval time: until this moment there
    // is no way to reach them that does not go through an admin's own phone.
    //
    // Returns null when the driver has already chosen a password of their own,
    // and that is the security rule of this whole path — a Telegram link proves
    // possession of a link, not of an identity (see docs/auth-and-security.md),
    // so re-linking must never be a password reset. A driver who forgets their
    // own password needs an admin, deliberately.
    const temporaryPassword = await this.driverAuth.issueTemporaryPassword(towTruck.id)

    // Names BOTH kinds of message this bot sends, so a driver who later gets a
    // contact notice isn't surprised by it. Since contact notices have no
    // opt-out, that warning is what stands between an annoyed driver and a bot
    // they have muted (see DriverNotificationService) — less costly than it was
    // when login codes came through here too, but still the channel we would
    // use to reach them about their account.
    const intro =
      `Բարև, ${towTruck.driverName}։ Ձեր Telegram-ը հաջողությամբ կապակցվեց Evakuators.am-ի հետ։\n\n` +
      'Այստեղ կստանաք ծանուցում, երբ որևէ մեկը կայքում սեղմում է Ձեզ հետ կապվելու կոճակը։ ' +
      'Bot-ը մի՛ արգելափակեք։'

    // Sent as a separate message, not appended to the one above: a driver has to
    // be able to forward, screenshot or delete the credential without losing the
    // explanation, and vice versa. Also keeps the password out of the message
    // that a driver who already has one still receives.
    await this.telegram.sendMessage(chatId, intro, { text: 'Մուտք գործել', url: this.telegram.loginUrl })

    if (temporaryPassword) {
      await this.telegram.sendMessage(
        chatId,
        'Ձեր մուտքի տվյալներն են՝\n\n' +
          `Հեռախոսահամար՝ ${towTruck.phone}\n` +
          `Ժամանակավոր գաղտնաբառ՝ ${temporaryPassword}\n\n` +
          'Առաջին մուտքից հետո համակարգը կխնդրի փոխել գաղտնաբառը՝ Ձեր նախընտրածով։ ' +
          'Այս գաղտնաբառը ոչ ոքի մի՛ փոխանցեք։',
        { text: 'Մուտք գործել', url: this.telegram.loginUrl },
      )
    }

    // Says whether a credential went out, never what it was. This line lands in
    // `pm2 logs` and stays on disk long after the password has been changed.
    this.logger.log(
      `Linked Telegram chat ${chatId} to TowTruck #${towTruck.id} ` +
        `(temporary password ${temporaryPassword ? 'issued' : 'not needed'})`,
    )
  }
}
