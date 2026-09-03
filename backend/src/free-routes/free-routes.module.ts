import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { DriverAuthModule } from '../driver-auth/driver-auth.module'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { FreeRoutesController } from './free-routes.controller'
import { FreeRoutesRepository } from './free-routes.repository'
import { FreeRoutesService } from './free-routes.service'
import { MyFreeRoutesController } from './my-free-routes.controller'
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'

@Module({
  imports: [TowTrucksModule, DriverAuthModule, AdminAuthModule, SubscriptionsModule], // AdminAuthModule for AdminNotificationService (Telegram new-free-route alert)
  controllers: [FreeRoutesController, MyFreeRoutesController],
  providers: [FreeRoutesService, FreeRoutesRepository],
})
export class FreeRoutesModule {}
