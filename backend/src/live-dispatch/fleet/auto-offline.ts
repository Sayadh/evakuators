/**
 * Auto-Offline (2026-11-18, owner's decision). Since an Online driver without
 * GPS keeps getting offers by his base for days (baseHeartbeatMaxAgeSeconds),
 * a phone that is really gone — switched off, flat, no internet — would cost
 * every nearby order one delivery window (offerDeliverySeconds) forever.
 * So: UNDELIVERED_IN_A_ROW offers in a row that expired WITHOUT a delivery ack
 * take him Offline. A delivered one in between — even rejected or answered
 * late — means the phone is there, and the count starts over.
 *
 * He comes back by opening the app and pressing Online (setAvailability clears
 * the mark). The app and the admin page show why. No Telegram (owner's choice).
 *
 * Runs inside the transaction that expires the offer (offers.repository.ts
 * `expire`), so the decision and the expiry commit together.
 */
import { enqueueRealtime } from '../notify/outbox'
import type { Sql } from '../platform/sql'

export const UNDELIVERED_IN_A_ROW = 3
export const AUTO_OFFLINE_UNDELIVERED = 'UNDELIVERED_OFFERS'

/** The driver's last offers, newest first, already closed: are the newest N all expired undelivered? Pure. */
export function unreachableByOffers(lastOffers: { status: string; delivered: boolean }[], n = UNDELIVERED_IN_A_ROW): boolean {
  if (lastOffers.length < n) return false
  return lastOffers.slice(0, n).every((offer) => offer.status === 'EXPIRED' && !offer.delivered)
}

/** Takes the driver Offline if his last N offers never reached the phone. Returns whether it did. */
export async function autoOfflineIfUnreachable(tx: Sql, driverId: number): Promise<boolean> {
  const last = await tx.query<{ status: string; delivered: boolean }>(
    `SELECT "status"::text AS "status", ("deliveredAt" IS NOT NULL) AS "delivered"
       FROM "OrderOffer" WHERE "driverId" = $1::int ORDER BY "createdAt" DESC LIMIT $2::int`,
    [driverId, UNDELIVERED_IN_A_ROW],
  )
  if (!unreachableByOffers(last.map((r) => ({ status: String(r.status), delivered: Boolean(r.delivered) })))) return false
  const rows = await tx.query(
    `UPDATE "DriverPresence"
        SET "wantsOnline" = false, "wantsOnlineChangedAt" = now(), "availableSince" = NULL,
            "autoOfflineAt" = now(), "autoOfflineReason" = $2, "updatedAt" = now()
      WHERE "driverId" = $1::int AND "wantsOnline" = true
      RETURNING 1`,
    [driverId, AUTO_OFFLINE_UNDELIVERED],
  )
  if (rows.length === 0) return false
  // A hint for an open app and the console; a phone that is gone gets it on its next connect
  await enqueueRealtime(tx, `auto-offline:${driverId}:${Date.now()}`, [`driver:${driverId}`, 'admin'], 'driver.autoOffline', { driverId })
  return true
}
