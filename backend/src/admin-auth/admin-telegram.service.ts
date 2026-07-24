import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppConfig } from '../config/configuration'

/**
 * Thin wrapper around a SEPARATE, dedicated Telegram bot used only for admin
 * security: 2FA login codes and new-registration notifications. Deliberately
 * not the same bot/token as the driver-facing one in `telegram/` — see
 * docs/auth-and-security.md ("separate secrets so compromising one system
 * doesn't compromise the other").
 *
 * Fully optional: when unconfigured (no ADMIN_TELEGRAM_BOT_TOKEN), every
 * method here is a silent no-op, so the rest of the app — including admin
 * login itself — keeps working exactly as before (single-factor).
 */
@Injectable()
export class AdminTelegramService {
  private readonly logger = new Logger(AdminTelegramService.name)
  private readonly botToken: string
  readonly botUsername: string
  readonly adminPanelUrl: string
  readonly isConfigured: boolean

  constructor(config: ConfigService) {
    const adminTelegram = config.getOrThrow<AppConfig['adminTelegram']>('adminTelegram')
    this.botToken = adminTelegram.botToken
    this.botUsername = adminTelegram.botUsername
    this.isConfigured = this.botToken !== '' && this.botUsername !== ''
    this.adminPanelUrl = `${config.getOrThrow<AppConfig['frontendUrl']>('frontendUrl')}/admin`
  }

  /** Builds the one-time deep link an admin taps to connect their Telegram (see admin:telegram-link script) */
  buildLinkUrl(token: string): string {
    return `https://t.me/${this.botUsername}?start=${token}`
  }

  async sendMessage(
    chatId: bigint | number | string,
    text: string,
    button?: { text: string; url: string },
  ): Promise<void> {
    if (!this.isConfigured) {
      this.logger.warn('ADMIN_TELEGRAM_BOT_TOKEN not configured — skipping admin Telegram message')
      return
    }

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
      this.logger.error(`Admin Telegram sendMessage failed (${response.status}): ${body}`)
      throw new Error('Failed to send admin Telegram message')
    }
  }
}
