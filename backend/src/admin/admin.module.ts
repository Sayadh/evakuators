import { Module } from '@nestjs/common'
import { RegistrationModule } from '../registration/registration.module'
import { ReviewsModule } from '../reviews/reviews.module'
import { TelegramModule } from '../telegram/telegram.module'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'

@Module({
  imports: [RegistrationModule, ReviewsModule, TowTrucksModule, TelegramModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
