import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { ReviewsModule } from '../reviews/reviews.module'
import { RoutingModule } from '../routing/routing.module'
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'
import { DispatchController } from './dispatch.controller'
import { DispatchRepository } from './dispatch.repository'
import { DispatchService } from './dispatch.service'

// AdminAuthModule for AdminJwtGuard; ReviewsModule for the rating column and
// SubscriptionsModule for the payment badge — both already export exactly the
// grouped, many-trucks-at-once readers this screen needs, so nothing here
// queries either domain directly.
//
// RoutingModule is the road distances behind the coordinate search, and the
// one daily budget they are paid from — shared with `/evakuator`, which is the
// whole reason that module exists rather than two copies of the counter.
@Module({
  imports: [AdminAuthModule, ReviewsModule, SubscriptionsModule, RoutingModule],
  controllers: [DispatchController],
  providers: [DispatchService, DispatchRepository],
  // The driver's own "jobs sent to you this month" reads through this.
  exports: [DispatchRepository],
})
export class DispatchModule {}
