import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { AuthenticatedDriverRequest } from '../driver-auth/driver-jwt.guard'
import { derivePaymentStatus, isLockedOut } from './subscription-status'
import { SubscriptionsRepository } from './subscriptions.repository'

export const SUBSCRIPTION_EXPIRED_MESSAGE =
  'Ձեր բաժանորդագրության ժամկետը սպառվել է։ Շարունակելու համար ընտրեք փաթեթ և վճարեք'

/**
 * Refuses a driver's WRITES once their subscription has run out.
 *
 * ## Why this exists at all
 *
 * The dashboard already replaces itself with the payment block for the same
 * driver. That is the part a person sees; this is the part that makes it
 * true. Without it the lock is a suggestion — the endpoints stay open, and
 * anything that talks to them directly (a stale tab that was already loaded,
 * a saved request, curl) keeps editing a profile the platform is no longer
 * being paid for.
 *
 * ## What it does NOT block
 *
 * Reads, the password change, the privacy consent, and every subscription
 * route — a locked driver has to be able to see where they stand and pay
 * their way out. Blocking any of those would strand them: a paywall that also
 * blocks paying is just a wall. So this is attached per-route to the writes
 * that cost us something (profile edits, free routes), never at controller
 * level.
 *
 * ## Ordering
 *
 * Always listed AFTER `DriverJwtGuard`, which is what puts `towTruckId` on the
 * request — Nest runs guards in declaration order, so reversing them would
 * mean reading an id nobody has set yet.
 *
 * ## 402, not 403
 *
 * "Payment Required" is exactly what this is, and it is deliberately not 401:
 * `apiFetch` treats a 401 on `/my/*` as an expired session and signs the
 * driver out (see repositories/apiClient.ts), which would eject someone whose
 * session is perfectly valid and whose actual problem is a bill.
 */
@Injectable()
export class SubscriptionActiveGuard implements CanActivate {
  constructor(private readonly subscriptionsRepository: SubscriptionsRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedDriverRequest>()
    const { towTruckId } = request

    // No id means DriverJwtGuard did not run before this one — refuse rather
    // than guess, since "no id" would otherwise read as "nothing to check".
    if (typeof towTruckId !== 'number') {
      throw new HttpException(SUBSCRIPTION_EXPIRED_MESSAGE, HttpStatus.PAYMENT_REQUIRED)
    }

    const coverage = await this.subscriptionsRepository.findCoverage([towTruckId])
    const status = derivePaymentStatus(coverage.get(towTruckId)?.paidUntil ?? null)

    if (isLockedOut(status)) {
      throw new HttpException(SUBSCRIPTION_EXPIRED_MESSAGE, HttpStatus.PAYMENT_REQUIRED)
    }
    return true
  }
}
