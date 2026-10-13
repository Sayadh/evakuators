import { Module, forwardRef } from '@nestjs/common'
import { DriverAuthModule } from '../driver-auth/driver-auth.module'
import { IdramModule } from '../idram/idram.module'
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { MyPromotionController } from './my-promotion.controller'
import { PromotionsService } from './promotions.service'

/**
 * Driver-bought placements.
 *
 * `SubscriptionsModule` for two different reasons, both real: the payment row
 * lives in that repository's table (one ledger, two products — see
 * PaymentKind), and a placement may not outlive the subscription it decorates,
 * which means reading coverage.
 *
 * `forwardRef` on IdramModule for the same reason SubscriptionsModule needs
 * one: this module asks Idram for a payment form, and Idram calls back here
 * when the money lands.
 */
@Module({
  imports: [
    DriverAuthModule,
    TowTrucksModule,
    // Both forwardRef'd: this module sits inside the cycle
    // Subscriptions → Idram → Promotions → Subscriptions, so by the time Nest
    // resolves this list, SubscriptionsModule is still mid-definition and a
    // direct reference reads as `undefined`.
    forwardRef(() => SubscriptionsModule),
    forwardRef(() => IdramModule),
  ],
  controllers: [MyPromotionController],
  providers: [PromotionsService],
  // IdramModule routes a confirmed placement payment here.
  exports: [PromotionsService],
})
export class PromotionsModule {}
