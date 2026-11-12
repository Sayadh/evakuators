/**
 * Topping the wallet up through Idram (2026-11-12).
 *
 * The bill is a row of the website's payment ledger (`SubscriptionPayment`,
 * kind WALLET_TOPUP) because Idram's EDP_BILL_NO IS that table's id — one id
 * space for everything Idram is asked to charge (see the model's comment).
 * `WalletTopup` says which app driver it is for. The Idram callback reaches
 * `confirmTopup` through IdramModule's payment handler registry; live
 * dispatch registers the handler (nest/wallet-payments.ts), so nothing
 * outside this folder imports from it.
 *
 * Confirmation marks the payment PAID and credits the wallet in ONE
 * transaction: a credited top-up is always a paid bill and vice versa.
 */
import { toDate, toNumber } from '../platform/params'
import type { Sql, SqlDatabase } from '../platform/sql'
import { enqueueRealtime } from '../notify/outbox'
import type { DispatchSettings } from '../platform/settings'
import { topupBonusAmd } from './domain/fees'
import { lowThresholdOf, post } from './wallet-ledger'

export const WALLET_TOPUP_CURRENCY = 'AMD'

export interface TopupBill {
  paymentId: number
  driverId: number
  amountAmd: number
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED'
  createdAt: Date
}

/** A new PENDING bill for this driver's wallet. Only a website-linked driver has a tow truck to bill. */
export async function createTopup(db: SqlDatabase, input: { driverId: number; towTruckId: number; amountAmd: number }): Promise<number> {
  return db.transaction(async (tx) => {
    const [row] = await tx.query<{ id: number }>(
      `INSERT INTO "SubscriptionPayment" ("towTruckId", "kind", "amount", "currency", "status", "createdAt", "updatedAt")
       VALUES ($1::int, 'WALLET_TOPUP', $2::int, $3, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING "id"`,
      [input.towTruckId, input.amountAmd, WALLET_TOPUP_CURRENCY],
    )
    const paymentId = toNumber(row.id)
    await tx.query(`INSERT INTO "WalletTopup" ("paymentId", "driverId") VALUES ($1::int, $2::int)`, [paymentId, input.driverId])
    return paymentId
  })
}

export async function topupBill(db: Sql, paymentId: number): Promise<TopupBill | null> {
  const [row] = await db.query<Record<string, unknown>>(
    `SELECT sp."id", sp."amount", sp."status", sp."createdAt", wt."driverId"
       FROM "SubscriptionPayment" sp JOIN "WalletTopup" wt ON wt."paymentId" = sp."id"
      WHERE sp."id" = $1::int AND sp."kind" = 'WALLET_TOPUP'`,
    [paymentId],
  )
  if (!row) return null
  return {
    paymentId: toNumber(row.id),
    driverId: toNumber(row.driverId),
    amountAmd: toNumber(row.amount),
    status: String(row.status) as TopupBill['status'],
    createdAt: toDate(row.createdAt),
  }
}

/** The driver's recent top-ups, newest first (pending ones too — "waiting for Idram") */
export async function topupsOf(db: Sql, driverId: number, limit = 10): Promise<TopupBill[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT sp."id", sp."amount", sp."status", sp."createdAt", wt."driverId"
       FROM "WalletTopup" wt JOIN "SubscriptionPayment" sp ON sp."id" = wt."paymentId"
      WHERE wt."driverId" = $1::int AND sp."kind" = 'WALLET_TOPUP'
      ORDER BY sp."id" DESC LIMIT $2::int`,
    [driverId, Math.min(Math.max(limit, 1), 50)],
  )
  return rows.map((row) => ({
    paymentId: toNumber(row.id),
    driverId: toNumber(row.driverId),
    amountAmd: toNumber(row.amount),
    status: String(row.status) as TopupBill['status'],
    createdAt: toDate(row.createdAt),
  }))
}

/**
 * Idram says the money arrived. `true` = credited now; `false` = this bill was
 * already credited (a retried callback, or an operator's hand confirmation),
 * which is still an "OK" for Idram. Throws only on a wrong bill.
 *
 * Credited whatever the bill's status (a CANCELLED bill paid anyway is still
 * the driver's money — the same rule IdramService applies to subscriptions).
 */
export async function confirmTopup(
  db: SqlDatabase,
  paymentId: number,
  source: { provider: string; transactionId: string },
  settings?: Pick<DispatchSettings, 'walletTopupBonusEnabled' | 'walletTopupBonusThresholdsAmd' | 'walletTopupBonusPercents' | 'walletFeeBaseAmd' | 'walletLowBalanceOrders'>,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [payment] = await tx.query<{ id: number; amount: number; status: string; driverId: number | null }>(
      `SELECT sp."id", sp."amount", sp."status", wt."driverId"
         FROM "SubscriptionPayment" sp LEFT JOIN "WalletTopup" wt ON wt."paymentId" = sp."id"
        WHERE sp."id" = $1::int AND sp."kind" = 'WALLET_TOPUP'
        FOR UPDATE OF sp`,
      [paymentId],
    )
    if (!payment || payment.driverId === null) throw new Error(`wallet: payment #${paymentId} is not a wallet top-up`)
    const [credited] = await tx.query(`SELECT 1 FROM "WalletEntry" WHERE "paymentId" = $1::int AND "kind" = 'TOPUP'`, [paymentId])
    if (credited) {
      await tx.query(
        `UPDATE "SubscriptionPayment" SET "provider" = COALESCE("provider", $2), "providerTransactionId" = COALESCE("providerTransactionId", $3), "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = $1::int AND "providerTransactionId" IS NULL`,
        [paymentId, source.provider, source.transactionId],
      )
      return false
    }
    await tx.query(
      `UPDATE "SubscriptionPayment" SET "status" = 'PAID', "provider" = $2, "providerTransactionId" = $3, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $1::int`,
      [paymentId, source.provider, source.transactionId],
    )
    const driverId = toNumber(payment.driverId)
    const amountAmd = toNumber(payment.amount)
    const lowThresholdAmd = settings ? lowThresholdOf(settings) : undefined
    let balanceAmd = await post(tx, { driverId, kind: 'TOPUP', amountAmd, paymentId, lowThresholdAmd })
    // A large top-up earns a bonus (2026-11-12), at the rates in force when it is credited
    const bonusAmd = settings ? topupBonusAmd(amountAmd, settings) : 0
    if (bonusAmd > 0) balanceAmd = await post(tx, { driverId, kind: 'TOPUP_BONUS', amountAmd: bonusAmd, paymentId, lowThresholdAmd })
    // The open app shows the new balance at once (a hint; it re-reads the wallet)
    await enqueueRealtime(tx, `wallet:topup:${paymentId}`, [`driver:${driverId}`], 'wallet.updated', { paymentId, balanceAmd })
    return true
  })
}

/** Precheck: a bill Idram may still charge — ours, a top-up, still waiting for payment */
export async function topupPayable(db: Sql, paymentId: number): Promise<boolean> {
  const bill = await topupBill(db, paymentId)
  return bill !== null && bill.status === 'PENDING'
}
