import { Module, forwardRef } from '@nestjs/common'
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'
import { IdramController } from './idram.controller'
import { IdramService } from './idram.service'

// SubscriptionsModule for the confirmation path and the payment lookup — this
// module owns the conversation with Idram, never the subscription rules. No
// cycle: SubscriptionsModule knows nothing about Idram.
@Module({
  imports: [forwardRef(() => SubscriptionsModule)],
  controllers: [IdramController],
  providers: [IdramService],
  // The driver's own payment creation attaches the Idram form to its response.
  exports: [IdramService],
})
export class IdramModule {}
