/**
 * Turns outbox `push.*` messages into FCM sends.
 *
 * Push is a NOTIFICATION, never the state: the app re-reads the offer/order
 * from the API when it opens from a push. So a late push is harmless — and
 * an offer push is not even attempted once the offer is no longer PENDING or
 * its deadline has passed (the TTL would be ≤ 0).
 *
 * Lock-screen text (2026-11, product decision): the offer shows WHERE FROM
 * and WHERE TO — the operator's short descriptions of pickup and destination
 * («Komitas → Davtashen») — and the distance, so a driver can decide from the
 * notification. Never the customer's phone or name. The descriptions are
 * capped in length (an operator may paste a long note there).
 */
import { toDate, toNullableNumber, toNumber } from '../platform/params'
import type { SqlDatabase } from '../platform/sql'
import type { PushSender } from './fcm'
import { enqueue } from './outbox'

export interface PushTexts {
  offerTitle: string
  offerBody: (distanceKm: number | null, from: string | null, to: string | null) => string
  orderTitle: string
  orderBody: (kind: string) => string
  /** Driver wallet (2026-11-12): what is left covers only a couple of orders */
  walletLowTitle?: string
  walletLowBody?: (balanceAmd: number) => string
  walletCreditedTitle?: string
  walletCreditedBody?: (amountAmd: number, balanceAmd: number) => string
}

/** Armenian is the app's primary language; the app re-renders in the driver's language when opened */
export const ARMENIAN_PUSH_TEXTS: PushTexts = {
  offerTitle: 'Նոր պատվեր',
  offerBody: (km, from, to) => {
    const route = from ? `${from} → ${to ?? 'նշված չէ'}` : null
    const distance = km === null ? null : `մոտ ${km.toFixed(1)} կմ`
    return [route, distance].filter(Boolean).join(' · ') || 'Բացեք հավելվածը՝ պատասխանելու համար'
  },
  orderTitle: 'Պատվերի թարմացում',
  orderBody: (kind) =>
    ({
      ORDER_CANCELLED: 'Պատվերը չեղարկվել է',
      PRICE_CONFIRMED: 'Գինը հաստատվել է',
      ASSIGNMENT_RELEASED: 'Պատվերը հանվել է ձեզնից',
      TERMS_CHANGED: 'Պատվերի պայմանները փոխվել են',
      RESUMED: 'Պատվերը շարունակվում է',
      PRICE_CORRECTED: 'Օպերատորը ճշգրտեց պատվերի գինը',
    })[kind] ?? 'Բացեք հավելվածը',
  walletCreditedTitle: 'Ձեր հաշիվը համալրվեց',
  walletCreditedBody: (amountAmd, balanceAmd) =>
    `+${amountAmd.toLocaleString('en-US').replace(/,/g, ' ')} ֏ · մնացորդը՝ ${balanceAmd.toLocaleString('en-US').replace(/,/g, ' ')} ֏`,
  walletLowTitle: 'Հաշվի մնացորդը քիչ է',
  walletLowBody: (balanceAmd) =>
    `Մնացորդը՝ ${balanceAmd.toLocaleString('en-US').replace(/,/g, ' ')} ֏։ Համալրեք հաշիվը, որ պատվերներ բաց չթողնեք։`,
}

/** Same identifier as the app's registered category (mobile/src/push/offerNotification.ts) */
export const OFFER_ACTION_CATEGORY = 'offer'

/**
 * The offer keeps ringing on a locked phone (product decision, 2026-11): the
 * push is re-sent every OFFER_RING_INTERVAL_SECONDS while the offer is still
 * PENDING and inside its deadline — answered, expired or revoked stops it,
 * because every send re-reads the row. Each repeat REPLACES the previous
 * notification (same collapse id / Android tag), so the driver sees one
 * notification that rings again. MAX_OFFER_RINGS is only a safety cap
 * (delivery window + answer window, rounded up).
 *
 * The sound is a file bundled in the app — same name on both platforms
 * (mobile/assets/sounds, the expo-notifications `sounds` plugin option).
 * The driver picks it per phone (2026-11, «Զանգի ձայն»): the app sends the
 * id with its push token, and the offer push names that file. Only iOS uses
 * the name (APNs plays it); Android rings with the app's own channel.
 */
export const OFFER_SOUND = 'offer_alert.wav'

/** The selectable rings — keep in step with mobile/src/push/sounds.ts ALERT_SOUND_IDS */
export const ALERT_SOUNDS = ['classic', 'urgent', 'orchestra', 'siren', 'melody', 'magic', 'reward', 'riff', 'piano', 'marimba', 'sunrise', 'vibes', 'kalimba', 'guitar', 'harp', 'flute', 'chime', 'bells', 'doorbell', 'calm', 'digital'] as const
export type AlertSound = (typeof ALERT_SOUNDS)[number]

export function isAlertSound(value: unknown): value is AlertSound {
  return typeof value === 'string' && (ALERT_SOUNDS as readonly string[]).includes(value)
}

/** The bundled file of a ring; unknown or missing → the original */
export function alertSoundFile(sound: string | null | undefined): string {
  return isAlertSound(sound) && sound !== 'classic' ? `offer_${sound}.wav` : OFFER_SOUND
}
export const OFFER_RING_INTERVAL_SECONDS = 10
export const MAX_OFFER_RINGS = 12

function short(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) return null
  return text.length > 40 ? `${text.slice(0, 39)}…` : text
}

export class PushService {
  constructor(
    private readonly db: SqlDatabase,
    private readonly sender: PushSender,
    private readonly texts: PushTexts = ARMENIAN_PUSH_TEXTS,
    private readonly options: { criticalAlerts?: boolean } = {},
  ) {}

  private async tokensFor(driverId: number): Promise<{ token: string; sound: string | null }[]> {
    const rows = await this.db.query<{ token: string; alertSound: string | null }>(
      `SELECT pt."token", pt."alertSound" FROM "PushDeviceToken" pt
         JOIN "DriverDeviceSession" s ON s."id" = pt."sessionId" AND s."revokedAt" IS NULL
        WHERE pt."driverId" = $1::int AND pt."invalidatedAt" IS NULL`,
      [driverId],
    )
    return rows.map((r) => ({ token: r.token, sound: r.alertSound ?? null }))
  }

  private async invalidate(token: string, reason: string): Promise<void> {
    await this.db.query(
      `UPDATE "PushDeviceToken" SET "invalidatedAt" = now(), "invalidReason" = $2 WHERE "token" = $1 AND "invalidatedAt" IS NULL`,
      [token, reason],
    )
  }

  /**
   * @param ring 1 for the first push, then 2, 3… for the repeats this method schedules itself
   * @returns 'retry' when a transient failure should be retried by the outbox
   */
  async sendOfferPush(offerId: string, ring = 1): Promise<'sent' | 'skipped' | 'retry'> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT f."id"::text AS "id", f."orderId", f."driverId", f."status", f."expiresAt", f."roadMeters",
              o."pickupAddress", o."destinationAddress",
              EXTRACT(EPOCH FROM (f."expiresAt" - now()))::float8 AS "ttl"
         FROM "OrderOffer" f JOIN "DispatchOrder" o ON o."id" = f."orderId"
        WHERE f."id" = $1::uuid`,
      [offerId],
    )
    const offer = rows[0]
    const ttl = offer ? Number(offer.ttl) : 0
    if (!offer || offer.status !== 'PENDING' || ttl < 2) {
      // A repeat that finds the offer answered/expired is the normal end of ringing, not a delivery failure
      if (ring === 1) await this.setDelivery(offerId, 'SKIPPED', null, offer ? `offer ${String(offer.status)} ttl ${Math.round(ttl)}` : 'missing')
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
    for (const { token, sound } of tokens) {
      const result = await this.sender.send({
        token,
        title: this.texts.offerTitle,
        body: this.texts.offerBody(meters === null ? null : meters / 1000, short(offer.pickupAddress), short(offer.destinationAddress)),
        data: {
          type: 'offer',
          offerId,
          orderId: String(offer.orderId),
          expiresAt: toDate(offer.expiresAt).toISOString(),
          ring: String(ring),
        },
        ttlSeconds: ttl,
        collapseKey: `offer-${offerId}`,
        highPriority: true,
        actionCategory: OFFER_ACTION_CATEGORY,
        sound: alertSoundFile(sound),
        timeSensitive: true,
        critical: this.options.criticalAlerts === true,
        contentAvailable: true,
      })
      if (result.ok) accepted = result.messageId
      else if (result.invalidToken) await this.invalidate(token, result.error)
      else if (result.retryable) retry = true
    }
    if (accepted) {
      await this.setDelivery(offerId, 'PROVIDER_ACCEPTED', accepted, null)
      await this.scheduleNextRing(offerId, ring)
      return 'sent'
    }
    if (retry) return 'retry'
    await this.setDelivery(offerId, 'PROVIDER_REJECTED', null, 'all tokens rejected')
    return 'skipped'
  }

  /**
   * Stops the offer's ring on the phone: a SILENT data push (no alert, no
   * sound) the app's background handler turns into "cancel the alarm
   * notification". Sent when an offer is withdrawn or times out (see
   * offers.repository.ts `enqueueOfferClosedPush`) — not when the driver
   * answered it himself. Best effort: the alarm also times out on its own at
   * the offer's deadline.
   */
  async sendOfferClosedPush(offerId: string): Promise<'sent' | 'skipped' | 'retry'> {
    const rows = await this.db.query<{ driverId: number }>(`SELECT "driverId" FROM "OrderOffer" WHERE "id" = $1::uuid`, [offerId])
    if (!rows[0]) return 'skipped'
    const tokens = await this.tokensFor(toNumber(rows[0].driverId))
    let sent = false
    let retry = false
    for (const { token } of tokens) {
      const result = await this.sender.send({
        token,
        title: '',
        body: '',
        data: { type: 'offer_closed', offerId },
        ttlSeconds: 120,
        collapseKey: `offer-closed-${offerId}`,
        highPriority: true,
        silent: true,
      })
      if (result.ok) sent = true
      else if (result.invalidToken) await this.invalidate(token, result.error)
      else if (result.retryable) retry = true
    }
    return sent ? 'sent' : retry ? 'retry' : 'skipped'
  }

  /** «Your balance is running low» — sent once per dip (wallet-ledger.ts `post`) */
  async sendWalletLowPush(driverId: number, balanceAmd: number): Promise<'sent' | 'skipped' | 'retry'> {
    const tokens = await this.tokensFor(driverId)
    if (tokens.length === 0) return 'skipped'
    let sent = false
    let retry = false
    for (const { token } of tokens) {
      const result = await this.sender.send({
        token,
        title: this.texts.walletLowTitle ?? ARMENIAN_PUSH_TEXTS.walletLowTitle!,
        body: (this.texts.walletLowBody ?? ARMENIAN_PUSH_TEXTS.walletLowBody!)(balanceAmd),
        data: { type: 'wallet_low', balanceAmd: String(balanceAmd) },
        ttlSeconds: 6 * 3600,
        collapseKey: `wallet-low-${driverId}`,
        highPriority: false,
      })
      if (result.ok) sent = true
      else if (result.invalidToken) await this.invalidate(token, result.error)
      else if (result.retryable) retry = true
    }
    return sent ? 'sent' : retry ? 'retry' : 'skipped'
  }

  /** An operator put money on the driver's balance by hand */
  async sendWalletCreditedPush(driverId: number, amountAmd: number, balanceAmd: number): Promise<'sent' | 'skipped' | 'retry'> {
    const tokens = await this.tokensFor(driverId)
    if (tokens.length === 0) return 'skipped'
    let sent = false
    let retry = false
    for (const { token } of tokens) {
      const result = await this.sender.send({
        token,
        title: this.texts.walletCreditedTitle ?? ARMENIAN_PUSH_TEXTS.walletCreditedTitle!,
        body: (this.texts.walletCreditedBody ?? ARMENIAN_PUSH_TEXTS.walletCreditedBody!)(amountAmd, balanceAmd),
        data: { type: 'wallet_credited', amountAmd: String(amountAmd), balanceAmd: String(balanceAmd) },
        ttlSeconds: 24 * 3600,
        collapseKey: `wallet-credited-${driverId}`,
        highPriority: false,
      })
      if (result.ok) sent = true
      else if (result.invalidToken) await this.invalidate(token, result.error)
      else if (result.retryable) retry = true
    }
    return sent ? 'sent' : retry ? 'retry' : 'skipped'
  }

  async sendOrderPush(orderId: number, driverId: number, kind: string): Promise<'sent' | 'skipped' | 'retry'> {
    const tokens = await this.tokensFor(driverId)
    if (tokens.length === 0) return 'skipped'
    let sent = false
    let retry = false
    for (const { token } of tokens) {
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

  /** Next repeat of the offer push; the dedupe key makes a re-run of this ring schedule nothing new */
  private async scheduleNextRing(offerId: string, ring: number): Promise<void> {
    if (ring >= MAX_OFFER_RINGS) return
    await enqueue(this.db, {
      topic: 'push.offer',
      payload: { offerId, ring: ring + 1 },
      dedupeKey: `push-offer:${offerId}:ring:${ring + 1}`,
      availableAtSql: `now() + make_interval(secs => ${OFFER_RING_INTERVAL_SECONDS})`,
      maxAttempts: 2,
    })
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
