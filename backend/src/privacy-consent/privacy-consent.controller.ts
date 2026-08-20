import { Body, Controller, Delete, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AuthenticatedDriverRequest, DriverJwtGuard } from '../driver-auth/driver-jwt.guard'
import { ConsentRequestContextService } from './consent-request-context'
import { AcceptPrivacyConsentDto } from './dto/accept-privacy-consent.dto'
import {
  PrivacyConsentService,
  type PrivacyConsentHistoryEntry,
  type PrivacyConsentStatusApi,
} from './privacy-consent.service'

/**
 * Privacy consent for the caller's own profile.
 *
 * ## Why it lives under `/my/tow-truck`
 *
 * Same reason `PATCH /my/tow-truck/password` does, and stated there at length:
 * every route here is an authenticated action on the caller's own record, so
 * the truck id comes from the JWT and **there is no id anywhere in the request
 * for anyone to point at somebody else**. That is not a check that can be
 * forgotten in a code path — it is an id that does not exist in the payload.
 * The spec's "a driver may only change their own consent" is satisfied
 * structurally rather than by a comparison.
 *
 * A `@Body()` with a `towTruckId` would be the obvious alternative shape, and
 * it is the one that produces the vulnerability: it would need a guard on every
 * method, forever, including the ones nobody has written yet.
 */
@Controller('my/tow-truck/privacy-consent')
@UseGuards(DriverJwtGuard)
export class PrivacyConsentController {
  constructor(
    private readonly privacyConsent: PrivacyConsentService,
    private readonly requestContext: ConsentRequestContextService,
  ) {}

  /**
   * Whether the dashboard must block, and on which version.
   *
   * Read on every dashboard load rather than trusted from the session the
   * frontend cached at login: a `localStorage` session survives a policy
   * version bump, and a driver who consented in another tab would otherwise
   * keep seeing the modal until they logged in again.
   */
  @Get()
  getStatus(@Req() request: AuthenticatedDriverRequest): Promise<PrivacyConsentStatusApi> {
    return this.privacyConsent.getStatus(request.towTruckId)
  }

  /**
   * Records the consent.
   *
   * Throttled well below the global 60/min. Not because this is a credential —
   * the guard already proved the session — but because it writes an audit row
   * and takes a User-Agent string, and an unthrottled authenticated write is
   * how an audit table becomes a place to dump data. 10/min leaves a driver
   * with a flaky connection all the retries they could want.
   *
   * Answers 200 with the new status rather than 204, and that is deliberate:
   * the response is what clears the frontend's blocking flag, so it has to
   * carry the fact that the block is over. A 204 would leave the dashboard
   * inferring success from the absence of an error.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  @HttpCode(200)
  accept(
    @Req() request: AuthenticatedDriverRequest,
    @Body() dto: AcceptPrivacyConsentDto,
  ): Promise<PrivacyConsentStatusApi> {
    return this.privacyConsent.acceptForDriver(
      request.towTruckId,
      dto.policyVersion,
      this.requestContext.from(request),
    )
  }

  /**
   * Withdraws it. The consent text promises this is possible at any time, so it
   * has to be an endpoint and not an email address.
   *
   * The rows are marked withdrawn, never deleted — see
   * `PrivacyConsentService.revokeForDriver`. The driver's next dashboard load
   * blocks again, which is the honest consequence of withdrawing consent to
   * publish rather than a punishment for it.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Delete()
  revoke(@Req() request: AuthenticatedDriverRequest): Promise<{ revoked: number }> {
    return this.privacyConsent.revokeForDriver(request.towTruckId)
  }

  /** The caller's own consent history — what they agreed to and when */
  @Get('history')
  history(@Req() request: AuthenticatedDriverRequest): Promise<PrivacyConsentHistoryEntry[]> {
    return this.privacyConsent.historyForDriver(request.towTruckId)
  }
}
