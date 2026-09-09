import { Injectable, Logger } from '@nestjs/common'
import {
  paymentRestoresListing,
  reactivationPhoneConflictMessage,
} from '../tow-trucks/tow-truck-reactivation'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'

/**
 * Puts a driver who was taken off the site FOR NON-PAYMENT back on it.
 *
 * ## Why this is its own provider
 *
 * Because money arrives two ways and only one of them used to do this. A driver
 * paying through Idram was reactivated; the identical amount handed over in
 * cash and recorded by an admin was not — same row in the same table, same
 * `paid` status afterwards, and the driver still off the site looking at a
 * lockout screen with no way to tell whether their money had arrived. The fix
 * had to be shared rather than copied, or the next writer of a PAID row would
 * be the third path that forgets.
 *
 * The dashboard promises this in so many words — «Վճարումը կատարելուց հետո էջը
 * կվերականգնվի» — and a promise the code does not keep is worse than one never
 * made.
 *
 * ## Deliberately narrow
 *
 * `paymentRestoresListing` allows only `DeactivationReason.UNPAID`. Anyone
 * removed for another reason, or before a reason was recorded, stays off until
 * a person decides otherwise: letting them buy their way back would turn every
 * removal into a price.
 *
 * ## Never throws
 *
 * Called after the money is already recorded. Anything that goes wrong here —
 * including the phone conflict below, which is a real integrity rule and not a
 * formality — must not turn a confirmed payment into a failed request, least of
 * all one Idram would then retry. Failures are logged at `error` so an admin
 * can finish by hand, and the payment stands either way.
 */
@Injectable()
export class ListingRestorationService {
  private readonly logger = new Logger(ListingRestorationService.name)

  constructor(private readonly towTrucksRepository: TowTrucksRepository) {}

  async afterPayment(towTruckId: number): Promise<void> {
    try {
      const towTruck = await this.towTrucksRepository.findById(towTruckId)
      if (!towTruck || !paymentRestoresListing(towTruck)) return

      // The same check AdminService makes before reactivating by hand: two
      // active trucks on one login phone means one of the two drivers silently
      // cannot sign in. A payment is not a reason to create that.
      const conflict = await this.towTrucksRepository.findByMainPhoneAnyStatus(
        towTruck.phone,
        towTruckId,
      )
      if (conflict?.isActive) {
        this.logger.error(
          `TowTruck #${towTruckId} paid but was NOT reactivated: ` +
            reactivationPhoneConflictMessage(towTruck.phone, conflict.slug),
        )
        return
      }

      await this.towTrucksRepository.setActive(towTruckId, true, null)
      this.logger.warn(`TowTruck #${towTruckId} reactivated automatically after payment`)
    } catch (error) {
      this.logger.error(
        `TowTruck #${towTruckId} paid but reactivation failed — restore it by hand`,
        error instanceof Error ? error.stack : String(error),
      )
    }
  }
}
