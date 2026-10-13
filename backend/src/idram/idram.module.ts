import { Module, forwardRef } from '@nestjs/common'
import { PromotionsModule } from '../promotions/promotions.module'
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'
import { IdramController } from './idram.controller'
import { IdramService } from './idram.service'

// SubscriptionsModule and PromotionsModule for the two confirmation paths and
// the payment lookup — this module owns the conversation with Idram, never the
// rules of what was bought. A bill number alone does not say which it was, so
// the branch is on the row's `kind` and lives in `handleConfirmation`.
@Module({
  imports: [forwardRef(() => SubscriptionsModule), forwardRef(() => PromotionsModule)],
  controllers: [IdramController],
  providers: [IdramService],
  // The driver's own payment creation attaches the Idram form to its response.
  exports: [IdramService],
})
export class IdramModule {}
