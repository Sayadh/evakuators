/**
 * The driver app's door to the WEBSITE profile behind a driver.
 *
 * Runs after `DriverAppGuard` (which puts `driverId` on the request) and puts
 * `towTruckId` next to it — the exact field `DriverJwtGuard` sets for the
 * website's `/my/*` routes. That is the whole trick: with it in place the
 * website's own guards and services (`SubscriptionActiveGuard`,
 * `ProfileChangesService`, `DriverAuthService.changePassword`) run for the app
 * UNCHANGED, so a driver's profile has one implementation of every rule,
 * whichever screen they edit it from.
 *
 * An app-only driver has no website profile and is refused with
 * `SITE_PROFILE_REQUIRED` (they can still see their account through
 * `GET /driver-app/me/profile`, which does not use this guard).
 */
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { DispatchError } from '../platform/errors'
import type { DriverAppRequest } from './auth'
import { LiveDispatchRuntimeHolder } from './runtime.provider'

export interface DriverAppSiteRequest extends DriverAppRequest {
  towTruckId: number
}

@Injectable()
export class DriverAppSiteProfileGuard implements CanActivate {
  constructor(private readonly holder: LiveDispatchRuntimeHolder) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DriverAppSiteRequest>()
    const towTruckId = await this.holder.runtime.access.towTruckIdOf(request.driverId)
    if (towTruckId === null) throw new DispatchError('SITE_PROFILE_REQUIRED')
    request.towTruckId = towTruckId
    return true
  }
}
