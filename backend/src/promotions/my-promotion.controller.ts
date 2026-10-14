import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { PromotionScope } from '@prisma/client'
import { AuthenticatedDriverRequest, DriverJwtGuard } from '../driver-auth/driver-jwt.guard'
import { CreatePromotionPaymentDto } from './dto/create-promotion-payment.dto'
import type { CreatedPromotionPaymentApi, PromotionStatusApi } from './promotion.types'
import { PromotionsService } from './promotions.service'

/**
 * Driver self-service for placements. Every route here only ever touches the
 * caller's own — the id comes from the session, never from the body.
 */
@Controller('my/promotion')
@UseGuards(DriverJwtGuard)
export class MyPromotionController {
  constructor(private readonly promotions: PromotionsService) {}

  /** What the dashboard block renders from: whether to show it, what is running, what is on sale */
  @Get()
  getMine(@Req() request: AuthenticatedDriverRequest): Promise<PromotionStatusApi> {
    return this.promotions.getStatus(request.towTruckId)
  }

  /**
   * «Վճարել» — records the order and returns the form that pays it.
   *
   * Throttled below the global limit for the same reason the subscription's own
   * create route is: this is a driver route that writes a row per press, so a
   * held-down button is the one way a single valid session fills a table.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('payments')
  create(
    @Req() request: AuthenticatedDriverRequest,
    @Body() dto: CreatePromotionPaymentDto,
  ): Promise<CreatedPromotionPaymentApi> {
    return this.promotions.createPayment(request.towTruckId, dto.days, dto.scope ?? PromotionScope.HOME)
  }

  /**
   * «Թարմացնել» — back to the top of the town's promoted block.
   *
   * Throttled harder than the allowance it spends. Six a day is the product
   * rule and it is enforced in one atomic UPDATE; this is only here so a script
   * cannot turn a spent allowance into a few hundred refused requests a minute.
   */
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post('refresh')
  refresh(@Req() request: AuthenticatedDriverRequest): Promise<PromotionStatusApi> {
    return this.promotions.refresh(request.towTruckId)
  }
}
