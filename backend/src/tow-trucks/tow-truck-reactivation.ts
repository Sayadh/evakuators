import { DeactivationReason } from '@prisma/client'

/**
 * Putting a driver back on the site — the rule, in the one place both callers
 * read it from.
 *
 * Two paths reactivate a truck and they must not drift: an admin doing it by
 * hand (`AdminService.setTowTruckActive`) and a confirmed payment doing it
 * automatically (`SubscriptionsService.confirmPayment`).
 */

/**
 * Refused when another truck is ALREADY ACTIVE on the same login phone.
 *
 * `phone` is the sole driver-login key (`findActiveByMainPhone`), and that
 * lookup is a `findFirst`: two active rows sharing one phone means one of the
 * two drivers silently cannot sign in, with nothing to explain it. See
 * `findByMainPhoneAnyStatus` for the full reasoning.
 */
export function reactivationPhoneConflictMessage(phone: string, conflictSlug: string): string {
  return (
    `Այս էվակուատորի հեռախոսահամարով (${phone}) արդեն կա ակտիվ էվակուատոր՝ «${conflictSlug}»։ ` +
    `Նախ փոխիր հեռախոսահամարներից մեկը, հետո ակտիվացրու։`
  )
}

/**
 * Whether a confirmed payment should put this driver back on the site.
 *
 * ## Only `UNPAID`, and that is the whole point
 *
 * An admin who took a driver off the site for non-payment was, in effect,
 * saying "pay and you are back" — the dashboard says exactly that to the
 * driver — so paying should not then require chasing an admin to finish the
 * job. A driver deactivated for any OTHER reason is a different decision: they
 * were removed for something a payment does not answer, and letting them buy
 * their way back on would turn every removal into a price.
 *
 * `null` (deactivated before this feature existed, so no reason was ever
 * recorded) is treated like OTHER — deliberately, and for the same reason
 * login does: we cannot tell after the fact whether someone was banned or had
 * simply not paid, and the safe direction is to leave that to a person.
 */
export function paymentRestoresListing(status: {
  isActive: boolean
  deactivationReason: DeactivationReason | null
}): boolean {
  return !status.isActive && status.deactivationReason === DeactivationReason.UNPAID
}
