import { Module } from '@nestjs/common'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { DriverNotificationService } from './driver-notification.service'
import { TelegramWebhookController } from './telegram-webhook.controller'
import { TelegramService } from './telegram.service'

/**
 * The driver-facing bot: the transport (TelegramService), the inbound webhook,
 * and the outbound notice logic (DriverNotificationService) that AnalyticsModule
 * fires. Notification logic lives next to its bot here for the same reason
 * AdminNotificationService lives in admin-auth next to the admin bot.
 */
@Module({
  imports: [TowTrucksModule],
  controllers: [TelegramWebhookController],
  providers: [TelegramService, DriverNotificationService],
  exports: [TelegramService, DriverNotificationService],
})
export class TelegramModule {}
