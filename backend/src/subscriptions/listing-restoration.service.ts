import { Injectable, Logger } from '@nestjs/common'
import {
  paymentRestoresListing,
  reactivationPhoneConflictMessage,
} from '../tow-trucks/tow-truck-reactivation'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'

/**
 * Everything that has to follow money arriving, wherever it arrived from.
 *
 * Two things, in order: the admin's billing deadline is retired, and a driver
 * who was taken off the site FOR NON-PAYMENT goes back on it.
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
      if (!towTruck) return

      // Retire the deadline before anything else, and OUTSIDE the
      // reactivation check below — this applies to every driver who pays,
      // while reactivation applies only to the few who were removed for it.
      //
      // Coverage is a MAX, so a stale deadline behind a live subscription is
      // already harmless to the arithmetic. It is not harmless to the admin:
      // «Դարձնել վճարովի» is hidden once a driver has paid, so a deadline left
      // on the row would be one nobody could see and nobody could clear.
      if (towTruck.paymentDueAt != null) {
        await this.towTrucksRepository.setPaymentDueAt(towTruckId, null)
        this.logger.warn(`Payment deadline retired for TowTruck #${towTruckId} — they paid`)
      }

      if (!paymentRestoresListing(towTruck)) return

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
