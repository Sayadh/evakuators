import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard'
import { AdminSubscriptionsService } from './admin-subscriptions.service'
import { DecideSubscriptionPaymentDto } from './dto/decide-subscription-payment.dto'
import { GrantSubscriptionPaymentDto } from './dto/grant-subscription-payment.dto'
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

  /** The queue: every request still waiting for a decision, oldest first */
  @Get('pending')
  listPending(): Promise<AdminPendingPaymentApi[]> {
    return this.adminSubscriptions.listPending()
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

  /** Confirm («the money arrived») or cancel one pending request */
  @Patch(':id')
  decide(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideSubscriptionPaymentDto,
  ): Promise<SubscriptionPaymentApi> {
    return this.adminSubscriptions.decide(id, dto.status)
  }
}
