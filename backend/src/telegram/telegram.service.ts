import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppConfig } from '../config/configuration'

/**
 * Thin wrapper around the Telegram Bot API. This is the ONLY place that
 * talks to Telegram — everything else (webhook parsing, OTP logic) lives
 * in the driver-auth module.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name)
  private readonly botToken: string
  readonly botUsername: string
  /** The site has no other visible entry point to the driver login page —
   * every Telegram message that's relevant to logging in should link here. */
  readonly loginUrl: string

  constructor(config: ConfigService) {
    const telegram = config.getOrThrow<AppConfig['telegram']>('telegram')
    this.botToken = telegram.botToken
    this.botUsername = telegram.botUsername
    this.loginUrl = `${config.getOrThrow<AppConfig['frontendUrl']>('frontendUrl')}/login`
  }

  /** Builds the one-time deep link the driver taps to start the bot conversation */
  buildLinkUrl(token: string): string {
    return `https://t.me/${this.botUsername}?start=${token}`
  }

  async sendMessage(
    chatId: bigint | number | string,
    text: string,
    button?: { text: string; url: string },
  ): Promise<void> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
