import { Module, forwardRef } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { IdramModule } from '../idram/idram.module'
import { DriverAuthModule } from '../driver-auth/driver-auth.module'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { AdminSubscriptionsController } from './admin-subscriptions.controller'
import { AdminSubscriptionsService } from './admin-subscriptions.service'
import { MySubscriptionPaymentsController } from './my-subscription-payments.controller'
import { MySubscriptionPlansController } from './my-subscription-plans.controller'
import { SubscriptionActiveGuard } from './subscription-active.guard'
import { SubscriptionsRepository } from './subscriptions.repository'
import { SubscriptionsService } from './subscriptions.service'

// DriverAuthModule for DriverJwtGuard and AdminAuthModule for AdminJwtGuard —
// the same imports every /my/* and /admin/* controller's module makes.
// TowTrucksModule for TowTrucksRepository (the admin grant checks the driver
// exists before recording money against them).
@Module({
  imports: [DriverAuthModule, AdminAuthModule, TowTrucksModule, forwardRef(() => IdramModule)],
  controllers: [
    MySubscriptionPlansController,
    MySubscriptionPaymentsController,
    AdminSubscriptionsController,
  ],
  providers: [
    SubscriptionsService,
    AdminSubscriptionsService,
    SubscriptionsRepository,
    SubscriptionActiveGuard,
  ],
  // AdminService reads coverage for the /admin/payments list; the guard is
  // attached to write routes on the driver's own controllers, which live in
  // MyTowTruckModule and FreeRoutesModule; and SubscriptionsService carries
  // the one confirmation path, which IdramModule calls when a payment lands.
  exports: [SubscriptionsService, SubscriptionsRepository, SubscriptionActiveGuard],
})
export class SubscriptionsModule {}
