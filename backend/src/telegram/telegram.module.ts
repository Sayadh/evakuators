import { Module } from '@nestjs/common'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { TelegramWebhookController } from './telegram-webhook.controller'
import { TelegramService } from './telegram.service'

@Module({
  imports: [TowTrucksModule],
  controllers: [TelegramWebhookController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
