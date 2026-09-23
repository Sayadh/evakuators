import { Body, Controller, Get, Param, Patch, ParseIntPipe, Post, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard'
import { AdminSubscriptionsService } from './admin-subscriptions.service'
import { GrantSubscriptionPaymentDto } from './dto/grant-subscription-payment.dto'
import { SetPaymentDueDto } from './dto/set-payment-due.dto'
import type {
  AdminPendingPaymentApi,
  SubscriptionPaymentApi,
  SubscriptionPlansApi,
} from './subscription.types'
import { SubscriptionsService } from './subscriptions.service'

/** Admin-only — deciding what drivers requested, and recording what arrived off-platform */
@Controller('admin/subscription-payments')
@UseGuards(AdminJwtGuard)
export class AdminSubscriptionsController {
  constructor(
    private readonly adminSubscriptions: AdminSubscriptionsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /**
   * The same plan list the driver's dashboard reads, served here too so the
   * admin's «record a payment» picker offers exactly what is on sale — one
   * set of constants, not a second copy of the prices in the admin UI.
   */
  @Get('plans')
  listPlans(): SubscriptionPlansApi {
    return this.subscriptions.listPlans()
  }

  /** Completed payments an admin has not ticked off yet, oldest first */
  @Get('review')
  listForReview(): Promise<AdminPendingPaymentApi[]> {
    return this.adminSubscriptions.listForReview()
  }

  /**
   * Records an off-platform payment. Declared before the `:id` route below so
   * nothing here can be read as an id — same discipline as `tow-trucks/count`
   * on the admin controller.
   */
  @Post()
  grant(@Body() dto: GrantSubscriptionPaymentDto): Promise<SubscriptionPaymentApi> {
    return this.adminSubscriptions.grant(dto.towTruckId, dto.planId, dto.paidAt)
  }

  /**
   * «Հաստատել» — an admin saying they have seen this payment, which takes it
   * off the review list and does nothing else. No body: there is exactly one
   * thing this can mean, and a payment that completed is not something an
   * admin can undo from here.
   */
  @Post(':id/review')
  review(@Param('id', ParseIntPipe) id: number): Promise<SubscriptionPaymentApi> {
    return this.adminSubscriptions.review(id)
  }

  /**
   * «Դարձնել վճարովի» on a driver's card — start billing someone who has never
   * paid, or take it back.
   *
   * The `:id` here is a TOW TRUCK, unlike every other `:id` on this controller,
   * which is a payment. Hence the segment: `tow-trucks/:id/payment-due` cannot
   * be read as `:id/review`'s sibling by accident, and the route table stays
   * unambiguous without depending on declaration order.
   *
   * On this controller rather than AdminController because the rule it applies
   * is a subscription rule — it reads coverage, and its deadline is the
   * `due-soon` window. The button that calls it lives on the admin card; where
   * the button is does not decide where the logic belongs.
   */
  @Patch('tow-trucks/:id/payment-due')
  setPaymentDue(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetPaymentDueDto,
  ): Promise<{ id: number; paymentDueAt?: string }> {
    return this.adminSubscriptions.setPaymentDue(id, dto.due)
  }
}
