import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AuthenticatedDriverRequest, DriverJwtGuard } from '../driver-auth/driver-jwt.guard'
import { CreateSubscriptionPaymentDto } from './dto/create-subscription-payment.dto'
import type {
  CreatedSubscriptionPaymentApi,
  MySubscriptionStatusApi,
  SubscriptionPaymentApi,
} from './subscription.types'
import { SubscriptionsService } from './subscriptions.service'

/** Driver self-service — every route here only ever touches the caller's own payments */
@Controller('my/subscription-payments')
@UseGuards(DriverJwtGuard)
export class MySubscriptionPaymentsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  /**
   * The gate decision, read on every dashboard load. A literal segment on a
   * controller with no `:id` route, so nothing can shadow it — and kept on
   * this resource rather than a controller of its own because it answers a
   * question about these payments.
   */
  @Get('status')
  getMyStatus(@Req() request: AuthenticatedDriverRequest): Promise<MySubscriptionStatusApi> {
    return this.subscriptionsService.getMyStatus(request.towTruckId)
  }

  @Get()
  listMine(@Req() request: AuthenticatedDriverRequest): Promise<SubscriptionPaymentApi[]> {
    return this.subscriptionsService.listMyPayments(request.towTruckId)
  }

  /**
   * «Վճարել» — records that this driver wants this plan, and nothing more:
   * no money moves yet (see `SubscriptionsService.createPayment`).
   *
   * The body is one plan code. The price, the months, the driver and the
   * status are all the server's to decide — see `CreateSubscriptionPaymentDto`
   * for why sending any of them is a rejected request rather than an ignored
   * field.
   *
   * Throttled below the global 60/min even though the guard already requires a
   * session: this is the only driver route that WRITES a new row per press,
   * so a held-down button is the one way a single valid session can fill a
   * table. Same limit as the other write-heavy routes (image upload,
   * password change).
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(
    @Req() request: AuthenticatedDriverRequest,
    @Body() dto: CreateSubscriptionPaymentDto,
  ): Promise<CreatedSubscriptionPaymentApi> {
    return this.subscriptionsService.createPayment(request.towTruckId, dto.planId)
  }
}
