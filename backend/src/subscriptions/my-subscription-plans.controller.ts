import { Controller, Get, UseGuards } from '@nestjs/common'
import { DriverJwtGuard } from '../driver-auth/driver-jwt.guard'
import type { SubscriptionPlansApi } from './subscription.types'
import { SubscriptionsService } from './subscriptions.service'

/**
 * The price list the driver's dashboard renders.
 *
 * Behind `DriverJwtGuard` like everything else under `/my/*` — not because
 * prices are secret, but because this is the signed-in driver's billing
 * screen, and the `/my/` prefix is load-bearing on the frontend: `apiFetch`'s
 * `handleExpiredSession` uses it to decide that a 401 means "this driver's
 * session expired, send them to /login" (see repositories/apiClient.ts). A
 * driver-facing route served from any other prefix would leave an expired
 * session showing a generic error instead of a login page.
 */
@Controller('my/subscription-plans')
@UseGuards(DriverJwtGuard)
export class MySubscriptionPlansController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  list(): SubscriptionPlansApi {
    return this.subscriptionsService.listPlans()
  }
}
