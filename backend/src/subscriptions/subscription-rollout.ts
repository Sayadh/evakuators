/**
 * Who the driver-facing half of subscriptions is switched on for.
 *
 * ## Why an allowlist and not just an on/off flag
 *
 * The Idram credentials already gate the feature (see `idram-config.ts`), but
 * they are the wrong knob for the phase this ships into: the merchant account
 * hands out TEST credentials first, against the same registered URLs, and the
 * only way to exercise the real flow — form handoff, callback, checksum,
 * confirmation, lockout — is to actually pay with them on production. Turning
 * the credentials on would put the «Վճարումներ» block in front of every driver
 * on the site, and lock out everyone the `20260902140000` backfill leaves
 * `overdue`, over a test.
 *
 * So the two questions are separated: *can this deployment take a payment*
 * (credentials) and *whose dashboard is allowed to ask for one* (this). During
 * testing the answer to the second is a handful of throwaway driver ids.
 *
 * ## Blank means NOBODY, deliberately
 *
 * `TELEGRAM_OUTBOUND_ALLOWED_CHAT_IDS` treats blank as "unrestricted", and
 * this is the opposite on purpose: that list decides who receives a message,
 * while this one decides who gets **locked out of their own page**. An unset
 * variable has to fail safe, and "I set the credentials and forgot the list"
 * has to be the harmless mistake rather than the one that takes the fleet
 * offline. Going live is therefore an explicit word — `all` — typed by someone
 * who meant it.
 */
export type SubscriptionRollout =
  | { mode: 'none' }
  | { mode: 'all' }
  | { mode: 'pilot'; towTruckIds: ReadonlySet<number> }

/** The literal that opens the feature to every driver. */
export const SUBSCRIPTION_ROLLOUT_ALL = 'all'

/**
 * `SUBSCRIPTIONS_PILOT_TOW_TRUCK_IDS` → the rollout it describes.
 *
 * Accepts `all`, a comma-separated list of tow-truck ids, or nothing. Anything
 * in the list that is not a positive integer is dropped rather than throwing:
 * a typo in one id must not take the API down at boot, and the ids that WERE
 * meant still work. A list that turns out to be entirely junk lands on `none`,
 * which is the safe end.
 */
export function parseSubscriptionRollout(raw: string): SubscriptionRollout {
  const value = raw.trim()
  if (value.length === 0) return { mode: 'none' }
  if (value.toLowerCase() === SUBSCRIPTION_ROLLOUT_ALL) return { mode: 'all' }

  const towTruckIds = new Set(
    value
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((id) => Number.isInteger(id) && id > 0),
  )
  return towTruckIds.size > 0 ? { mode: 'pilot', towTruckIds } : { mode: 'none' }
}

/** Whether this specific driver is inside the rollout. */
export function isInSubscriptionRollout(rollout: SubscriptionRollout, towTruckId: number): boolean {
  switch (rollout.mode) {
    case 'all':
      return true
    case 'pilot':
      return rollout.towTruckIds.has(towTruckId)
    default:
      return false
  }
}
