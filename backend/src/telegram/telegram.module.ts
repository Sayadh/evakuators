import { Module } from '@nestjs/common'
import { DriverAuthModule } from '../driver-auth/driver-auth.module'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { DriverNotificationService } from './driver-notification.service'
import { TelegramWebhookController } from './telegram-webhook.controller'
import { TelegramService } from './telegram.service'

/**
 * The driver-facing bot: the transport (TelegramService), the inbound webhook,
 * and the outbound notice logic (DriverNotificationService) that AnalyticsModule
 * fires. Notification logic lives next to its bot here for the same reason
 * AdminNotificationService lives in admin-auth next to the admin bot.
 *
 * DriverAuthModule is imported for the one-time password the webhook hands a
 * newly linked driver. The dependency only points this way — driver auth does
 * not import Telegram — so the cycle that would otherwise form is avoided by
 * keeping delivery here and minting there.
 */
@Module({
  imports: [TowTrucksModule, DriverAuthModule],
  controllers: [TelegramWebhookController],
  providers: [TelegramService, DriverNotificationService],
  exports: [TelegramService, DriverNotificationService],
})
export class TelegramModule {}
