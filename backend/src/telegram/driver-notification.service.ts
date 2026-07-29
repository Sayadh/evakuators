import { Injectable, Logger } from '@nestjs/common'
import { AnalyticsEventType } from '@prisma/client'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import { TelegramService } from './telegram.service'

/**
 * The message per event type.
 *
 * Wording is deliberate and was iterated on: it states ONLY what we actually
 * observed — someone pressed the contact button — and never predicts that a
 * call will happen. We genuinely don't know: pressing "Զանգահարել" opens the
 * dialer, it doesn't place the call, and the visitor may hang up or change
 * their mind. "Ձեր համարով զանգում են" would be a claim we can't back, and a
 * driver who learns the notices overpromise stops trusting them entirely —
 * which destroys the one thing this feature exists for.
 *
 * The attribution ("…Evakuators.am-ից") is the entire point: when the phone
 * rings seconds later, the driver connects the two on their own. We describe
 * what happened and let them draw the conclusion, rather than drawing it for
 * them and being wrong some of the time.
 */
const CONTACT_MESSAGES: Partial<Record<AnalyticsEventType, string>> = {
  [AnalyticsEventType.PHONE_CLICK]:
    '📞 Հենց նոր ձեր համարը վերցրել են Evakuators.am-ից՝ ձեզ զանգելու համար',
  [AnalyticsEventType.WHATSAPP_CLICK]:
    '💬 Հենց նոր ձեր WhatsApp-ը բացել են Evakuators.am-ից',
}

/**
 * Sent ONCE, appended to the very first notice a driver ever receives.
 *
 * It sets the expectation the message itself deliberately avoids setting, so
 * the driver isn't left wondering why a notice arrived and no call followed.
 * Repeating it on every notice would bury the one line that has to be readable
 * at a glance from a lock screen, which is why it is claimed atomically and
 * never sent again — see TowTrucksRepository.claimContactNoticeIntro().
 *
 * No "you can turn these off" line: contact notices are a fixed part of being
 * listed, there is no per-driver switch to point at.
 */
const INTRO_NOTICE =
  '\n\nℹ️ Այս ծանուցումը գալիս է, երբ որևէ մեկը Evakuators.am-ում սեղմում է ձեզ հետ ' +
  'կապվելու կոճակը։ Դա չի նշանակում, որ զանգը միշտ կկայանա։'

/**
 * Driver-facing Telegram notices, triggered by visitor contact intent.
 *
 * Mirrors AdminNotificationService (which lives with the admin bot and is
 * consumed by RegistrationService): the notification logic sits next to the
 * bot that delivers it, and the caller just fires it. Best-effort by
 * construction — every path here swallows its own errors, because the caller
 * is the anonymous analytics write path and a visitor pressing "call" must
 * never wait on, or be affected by, a Telegram round-trip.
 */
@Injectable()
export class DriverNotificationService {
  private readonly logger = new Logger(DriverNotificationService.name)

  constructor(
    private readonly towTrucksRepository: TowTrucksRepository,
    private readonly telegram: TelegramService,
  ) {}

  /**
   * Tells a driver that a visitor just took their contact details.
   *
   * Only called for events that actually counted (see
   * AnalyticsTrackingService), which is what keeps the volume sane without a
   * throttle of its own: the analytics dedup already collapses repeated taps
   * by the same visitor on the same day into one event, so one notice
   * corresponds to one interested person, not to one finger.
   *
   * Never throws, never rejects.
   */
  async notifyContactIntent(towTruckId: number, eventType: AnalyticsEventType): Promise<void> {
    const message = CONTACT_MESSAGES[eventType]
    if (!message) return

    try {
      // A missing chat id is the only thing that stops a notice — the driver
      // simply has no Telegram linked yet, so there is nowhere to send it.
      const target = await this.towTrucksRepository.findNotificationTargetById(towTruckId)
      if (!target?.telegramChatId) return

      // Claim BEFORE sending, release if the send fails. The other order
      // (send, then record) would let two concurrent notices both carry the
      // intro; this order can at worst lose it, and the release below makes
      // even that self-healing on the next notice.
      const withIntro = target.contactNoticeIntroAt === null
        ? await this.towTrucksRepository.claimContactNoticeIntro(towTruckId)
        : false

      try {
        // No inline button: this arrives while the driver's phone is about to
        // ring. The message has to be readable at a glance from a lock screen
        // and nothing else — a link to open elsewhere competes with that.
        await this.telegram.sendMessage(
          target.telegramChatId,
          withIntro ? `${message}${INTRO_NOTICE}` : message,
        )
      } catch (error) {
        if (withIntro) {
          await this.towTrucksRepository
            .releaseContactNoticeIntro(towTruckId)
            .catch(() => undefined)
        }
        throw error
      }
    } catch (error) {
      // A blocked bot, a muted chat, a Telegram outage — all expected, none
      // actionable, and none of them may reach the visitor who just pressed a
      // button. Logged at warn so a systematic failure is still greppable.
      this.logger.warn(
        `Contact notice to TowTruck #${towTruckId} failed: ${String(error)}`,
      )
    }
  }
}
