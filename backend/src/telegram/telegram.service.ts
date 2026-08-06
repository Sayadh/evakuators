import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppConfig } from '../config/configuration'

/** Upper bound on any single Telegram Bot API call — see sendMessage() */
const TELEGRAM_REQUEST_TIMEOUT_MS = 10_000

/**
 * Thin wrapper around the Telegram Bot API. This is the ONLY place that talks
 * to Telegram — webhook parsing lives in TelegramWebhookController, and what a
 * given message is FOR (linking, a password handover, a contact notice) lives
 * with the feature that sends it.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name)
  private readonly botToken: string
  readonly botUsername: string
  /** The site has no other visible entry point to the driver login page —
   * every Telegram message that's relevant to logging in should link here. */
  readonly loginUrl: string
  /**
   * When non-empty, `sendMessage()` sends only to these chat ids. See that
   * method for why this exists — in one sentence, it lets a staging deploy
   * share production's bot token without being able to message a real
   * driver.
   */
  private readonly outboundAllowedChatIds: Set<string>

  constructor(config: ConfigService) {
    const telegram = config.getOrThrow<AppConfig['telegram']>('telegram')
    this.botToken = telegram.botToken
    this.botUsername = telegram.botUsername
    this.loginUrl = `${config.getOrThrow<AppConfig['frontendUrl']>('frontendUrl')}/login`
    this.outboundAllowedChatIds = new Set(telegram.outboundAllowedChatIds)
  }

  /** Builds the one-time deep link the driver taps to start the bot conversation */
  buildLinkUrl(token: string): string {
    return `https://t.me/${this.botUsername}?start=${token}`
  }

  /**
   * Every driver-facing message — link confirmations, the one-time password
   * handover, contact notices — goes through here. This is THE outbound choke
   * point for the driver bot (see
   * the class-level comment), which is exactly why the allowlist check below
   * lives here and not in each individual caller.
   *
   * ## Why this exists
   *
   * A staging deploy that shares production's `TELEGRAM_BOT_TOKEN` (rather
   * than getting its own bot — see docs/deployment.md § "Staging
   * environment") is, from Telegram's point of view, indistinguishable from
   * production: the same bot, the same API, real delivery to a real phone's
   * Telegram app. If staging's copy of the database (itself copied wholesale
   * from production) contains another driver's real, already-linked
   * `telegramChatId`, then testing the login flow against THAT driver's phone
   * number sends THEM a real "here is your login code" message — confusing at
   * best, alarming at worst, and not something any amount of "please only
   * test with your own number" operator discipline reliably prevents once
   * it's 2am and the wrong test phone number gets pasted in.
   *
   * Setting `TELEGRAM_OUTBOUND_ALLOWED_CHAT_IDS` makes that structurally
   * impossible instead of merely discouraged: any chat id not on the list is
   * silently skipped, no HTTP call to Telegram is made at all, and the caller
   * (e.g. `TelegramWebhookController.handleStart`) sees this resolve normally — it
   * still can't tell a skipped send from a real one, same as
   * `ADMIN_TELEGRAM_ALLOWED_CHAT_IDS` already behaves for the admin bot's
   * inbound side. Empty (production's default) means unrestricted, i.e. this
   * check is a no-op and today's behaviour is unchanged.
   */
  async sendMessage(
    chatId: bigint | number | string,
    text: string,
    button?: { text: string; url: string },
  ): Promise<void> {
    if (this.outboundAllowedChatIds.size > 0 && !this.outboundAllowedChatIds.has(chatId.toString())) {
      this.logger.warn(
        `Telegram sendMessage to chat ${chatId.toString()} skipped — not in TELEGRAM_OUTBOUND_ALLOWED_CHAT_IDS`,
      )
      return
    }

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Node's fetch has NO default timeout. Without this, a hanging Telegram
      // API call hangs the caller with it — and one caller is the webhook that
      // hands a driver their password, which awaits this before acking
      // Telegram, so a slow Telegram would hold that request open indefinitely
      // and be recorded as a failed delivery. Fire-and-forget callers (contact
      // notices) would meanwhile accumulate pending promises.
      signal: AbortSignal.timeout(TELEGRAM_REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        chat_id: chatId.toString(),
        text,
        ...(button && {
          reply_markup: { inline_keyboard: [[{ text: button.text, url: button.url }]] },
        }),
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      this.logger.error(`Telegram sendMessage failed (${response.status}): ${body}`)
      throw new Error('Failed to send Telegram message')
    }
  }
}
