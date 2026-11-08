/**
 * Turns outbox `push.*` messages into FCM sends.
 *
 * Push is a NOTIFICATION, never the state: the app re-reads the offer/order
 * from the API when it opens from a push. So a late push is harmless — and
 * an offer push is not even attempted once the offer is no longer PENDING or
 * its deadline has passed (the TTL would be ≤ 0).
 *
 * Lock-screen text carries no personal data: no address, no phone, no name.
 */
import { toDate, toNullableNumber, toNumber } from '../platform/params'
import type { SqlDatabase } from '../platform/sql'
import type { PushSender } from './fcm'

export interface PushTexts {
  offerTitle: string
  offerBody: (distanceKm: number | null) => string
  orderTitle: string
  orderBody: (kind: string) => string
}

/** Armenian is the app's primary language; the app re-renders in the driver's language when opened */
export const ARMENIAN_PUSH_TEXTS: PushTexts = {
  offerTitle: 'Նոր պատվեր',
  offerBody: (km) => (km === null ? 'Բացեք հավելվածը՝ պատասխանելու համար' : `Մոտ ${km.toFixed(1)} կմ · բացեք՝ պատասխանելու համար`),
  orderTitle: 'Պատվերի թարմացում',
  orderBody: (kind) =>
    ({
      ORDER_CANCELLED: 'Պատվերը չեղարկվել է',
      PRICE_CONFIRMED: 'Գինը հաստատվել է',
      ASSIGNMENT_RELEASED: 'Պատվերը հանվել է ձեզնից',
      TERMS_CHANGED: 'Պատվերի պայմանները փոխվել են',
      RESUMED: 'Պատվերը շարունակվում է',
    })[kind] ?? 'Բացեք հավելվածը',
}

export class PushService {
  constructor(
    private readonly db: SqlDatabase,
    private readonly sender: PushSender,
    private readonly texts: PushTexts = ARMENIAN_PUSH_TEXTS,
  ) {}

  private async tokensFor(driverId: number): Promise<string[]> {
    const rows = await this.db.query<{ token: string }>(
      `SELECT pt."token" FROM "PushDeviceToken" pt
         JOIN "DriverDeviceSession" s ON s."id" = pt."sessionId" AND s."revokedAt" IS NULL
        WHERE pt."driverId" = $1::int AND pt."invalidatedAt" IS NULL`,
      [driverId],
    )
    return rows.map((r) => r.token)
  }

  private async invalidate(token: string, reason: string): Promise<void> {
    await this.db.query(
      `UPDATE "PushDeviceToken" SET "invalidatedAt" = now(), "invalidReason" = $2 WHERE "token" = $1 AND "invalidatedAt" IS NULL`,
      [token, reason],
    )
  }

  /** @returns 'retry' when a transient failure should be retried by the outbox */
  async sendOfferPush(offerId: string): Promise<'sent' | 'skipped' | 'retry'> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT "id"::text AS "id", "orderId", "driverId", "status", "expiresAt", "roadMeters",
              EXTRACT(EPOCH FROM ("expiresAt" - now()))::float8 AS "ttl"
         FROM "OrderOffer" WHERE "id" = $1::uuid`,
      [offerId],
    )
    const offer = rows[0]
    const ttl = offer ? Number(offer.ttl) : 0
    if (!offer || offer.status !== 'PENDING' || ttl < 2) {
      await this.setDelivery(offerId, 'SKIPPED', null, offer ? `offer ${String(offer.status)} ttl ${Math.round(ttl)}` : 'missing')
      return 'skipped'
    }
    const driverId = toNumber(offer.driverId)
    const tokens = await this.tokensFor(driverId)
    if (tokens.length === 0) {
      await this.setDelivery(offerId, 'SKIPPED', null, 'no live push token')
      return 'skipped'
    }
    const meters = toNullableNumber(offer.roadMeters)
    let accepted: string | null = null
    let retry = false
    for (const token of tokens) {
      const result = await this.sender.send({
        token,
        title: this.texts.offerTitle,
        body: this.texts.offerBody(meters === null ? null : meters / 1000),
        data: {
          type: 'offer',
          offerId,
          orderId: String(offer.orderId),
          expiresAt: toDate(offer.expiresAt).toISOString(),
        },
        ttlSeconds: ttl,
        collapseKey: `offer-${offerId}`,
        highPriority: true,
      })
      if (result.ok) accepted = result.messageId
      else if (result.invalidToken) await this.invalidate(token, result.error)
      else if (result.retryable) retry = true
    }
    if (accepted) {
      await this.setDelivery(offerId, 'PROVIDER_ACCEPTED', accepted, null)
      return 'sent'
    }
    if (retry) return 'retry'
    await this.setDelivery(offerId, 'PROVIDER_REJECTED', null, 'all tokens rejected')
    return 'skipped'
  }

  async sendOrderPush(orderId: number, driverId: number, kind: string): Promise<'sent' | 'skipped' | 'retry'> {
    const tokens = await this.tokensFor(driverId)
    if (tokens.length === 0) return 'skipped'
    let sent = false
    let retry = false
    for (const token of tokens) {
      const result = await this.sender.send({
        token,
        title: this.texts.orderTitle,
        body: this.texts.orderBody(kind),
        data: { type: 'order', orderId: String(orderId), kind },
        ttlSeconds: 3600,
        collapseKey: `order-${orderId}`,
        highPriority: kind === 'ORDER_CANCELLED' || kind === 'ASSIGNMENT_RELEASED',
      })
      if (result.ok) sent = true
      else if (result.invalidToken) await this.invalidate(token, result.error)
      else if (result.retryable) retry = true
    }
    return sent ? 'sent' : retry ? 'retry' : 'skipped'
  }

  private async setDelivery(offerId: string, status: string, providerMessageId: string | null, error: string | null): Promise<void> {
    // Never downgrade APP_ACKNOWLEDGED (the app may have rendered it over WebSocket first).
    await this.db.query(
      `UPDATE "NotificationDelivery" SET "status" = $2, "providerMessageId" = COALESCE($3, "providerMessageId"),
              "error" = $4, "updatedAt" = now()
        WHERE "offerId" = $1::uuid AND "channel" = 'PUSH' AND "status" <> 'APP_ACKNOWLEDGED'`,
      [offerId, status, providerMessageId, error],
    )
  }
}
