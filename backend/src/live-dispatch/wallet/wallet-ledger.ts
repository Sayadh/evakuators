/**
 * The driver wallet's ledger (2026-11-12) — every write that moves money, as
 * functions over the CALLER's transaction, so a fee is charged in the very
 * transaction that accepts the order, and a refund in the one that cancels it.
 * There is no path where the order changes and the money does not, or the
 * other way round.
 *
 * Rules:
 * - `DriverWallet.balanceAmd` is changed ONLY by `post`, which writes the
 *   ledger line in the same statement sequence and stores the balance after
 *   it. The row lock taken by its UPDATE serialises concurrent posts for one
 *   driver.
 * - Idempotency lives in the database: one fee and one refund per
 *   assignment, one credit per payment (partial unique indexes). A retried
 *   transaction cannot charge twice.
 * - The fee schedule is copied onto the ORDER_FEE line (`feeRules`); later
 *   settlements of that order use it — the terms the driver accepted under.
 * - The balance may go below zero only by settlement (the price was agreed
 *   higher after accept) or by an operator's debit; dispatch then stops
 *   offering him orders until he tops up (eligibility, `walletPredicate`).
 */
import { toDate, toNumber, type Params } from '../platform/params'
import type { Sql } from '../platform/sql'
import { feeRulesOf, orderFeeAmd, type FeeRules } from './domain/fees'
import type { DispatchSettings } from '../platform/settings'
import { enqueue } from '../notify/outbox'

export type WalletEntryKind = 'TOPUP' | 'TOPUP_BONUS' | 'ORDER_FEE' | 'ORDER_FEE_ADJUSTMENT' | 'ORDER_FEE_REFUND' | 'ADMIN_CREDIT' | 'ADMIN_DEBIT'

export interface WalletEntryInput {
  driverId: number
  kind: WalletEntryKind
  amountAmd: number
  orderId?: number | null
  assignmentId?: number | null
  paymentId?: number | null
  feeRules?: FeeRules | null
  note?: string | null
  createdByUserId?: number | null
  /**
   * «Running low» push (2026-11-12): when a DEBIT leaves less than this
   * (balance + credit limit), the driver is told once per dip. A credit that
   * lifts him back above it re-arms the push. Absent = no push.
   */
  lowThresholdAmd?: number
}

export interface WalletEntry {
  id: number
  kind: WalletEntryKind
  amountAmd: number
  balanceAfterAmd: number
  orderId: number | null
  orderNumber: string | null
  note: string | null
  createdAt: Date
}

/**
 * The only writer of a balance: one ledger line, one balance change.
 * Returns the balance after it.
 */
export async function post(tx: Sql, entry: WalletEntryInput): Promise<number> {
  if (!Number.isSafeInteger(entry.amountAmd) || entry.amountAmd === 0) throw new Error(`wallet: bad amount ${entry.amountAmd}`)
  await tx.query(`INSERT INTO "DriverWallet" ("driverId") VALUES ($1::int) ON CONFLICT ("driverId") DO NOTHING`, [entry.driverId])
  const [row] = await tx.query<{ balanceAmd: number; creditLimitAmd: number; lowNotifiedAt: unknown }>(
    `UPDATE "DriverWallet" SET "balanceAmd" = "balanceAmd" + $2::int, "updatedAt" = now()
      WHERE "driverId" = $1::int RETURNING "balanceAmd", "creditLimitAmd", "lowNotifiedAt"`,
    [entry.driverId, entry.amountAmd],
  )
  const balanceAfter = toNumber(row.balanceAmd)
  if (entry.lowThresholdAmd !== undefined) {
    const available = balanceAfter + toNumber(row.creditLimitAmd)
    const notified = row.lowNotifiedAt !== null && row.lowNotifiedAt !== undefined
    if (entry.amountAmd < 0 && available < entry.lowThresholdAmd && !notified) {
      await tx.query(`UPDATE "DriverWallet" SET "lowNotifiedAt" = now() WHERE "driverId" = $1::int`, [entry.driverId])
      await enqueue(tx, {
        topic: 'push.walletLow',
        payload: { driverId: entry.driverId, balanceAmd: balanceAfter },
        dedupeKey: `wallet-low:${entry.driverId}:${Date.now()}`,
        maxAttempts: 3,
      })
    } else if (entry.amountAmd > 0 && available >= entry.lowThresholdAmd && notified) {
      await tx.query(`UPDATE "DriverWallet" SET "lowNotifiedAt" = NULL WHERE "driverId" = $1::int`, [entry.driverId])
    }
  }
  await tx.query(
    `INSERT INTO "WalletEntry" ("driverId", "kind", "amountAmd", "balanceAfterAmd", "orderId", "assignmentId", "paymentId", "feeRules", "note", "createdByUserId")
     VALUES ($1::int, $2::"WalletEntryKind", $3::int, $4::int, $5::int, $6::int, $7::int, $8::jsonb, $9, $10::int)`,
    [
      entry.driverId,
      entry.kind,
      entry.amountAmd,
      balanceAfter,
      entry.orderId ?? null,
      entry.assignmentId ?? null,
      entry.paymentId ?? null,
      entry.feeRules ? JSON.stringify(entry.feeRules) : null,
      entry.note ?? null,
      entry.createdByUserId ?? null,
    ],
  )
  return balanceAfter
}

export async function balanceOf(db: Sql, driverId: number): Promise<number> {
  return (await walletOf(db, driverId)).balanceAmd
}

/** Balance and the credit an operator allows him; `availableAmd` is what dispatch compares against a fee */
export async function walletOf(db: Sql, driverId: number): Promise<{ balanceAmd: number; creditLimitAmd: number; availableAmd: number }> {
  const [row] = await db.query<{ balanceAmd: number; creditLimitAmd: number }>(
    `SELECT "balanceAmd", "creditLimitAmd" FROM "DriverWallet" WHERE "driverId" = $1::int`,
    [driverId],
  )
  const balanceAmd = row ? toNumber(row.balanceAmd) : 0
  const creditLimitAmd = row ? toNumber(row.creditLimitAmd) : 0
  return { balanceAmd, creditLimitAmd, availableAmd: balanceAmd + creditLimitAmd }
}

/** Operator: how far below zero this driver may go and still be offered orders (0 = not at all) */
export async function setCreditLimit(tx: Sql, driverId: number, creditLimitAmd: number): Promise<void> {
  await tx.query(`INSERT INTO "DriverWallet" ("driverId") VALUES ($1::int) ON CONFLICT ("driverId") DO NOTHING`, [driverId])
  await tx.query(`UPDATE "DriverWallet" SET "creditLimitAmd" = $2::int, "updatedAt" = now() WHERE "driverId" = $1::int`, [driverId, creditLimitAmd])
}

/** The «running low» line for this schedule: what N base fees cost */
export function lowThresholdOf(settings: Pick<DispatchSettings, 'walletFeeBaseAmd' | 'walletLowBalanceOrders'>): number {
  return settings.walletFeeBaseAmd * settings.walletLowBalanceOrders
}

/**
 * Accept: charge the fee for this assignment, from the order's price if it
 * has one (else the base fee — settled when the price is agreed). No-op while
 * billing is off. Called inside the accept transaction.
 */
export async function chargeOrderFee(
  tx: Sql,
  input: { driverId: number; orderId: number; assignmentId: number; priceAmd: number | null },
  settings: DispatchSettings,
): Promise<number | null> {
  if (settings.walletBillingEnabled !== 1) return null
  const rules = feeRulesOf(settings)
  const fee = orderFeeAmd(input.priceAmd, rules)
  if (fee <= 0) return null
  await post(tx, {
    driverId: input.driverId,
    kind: 'ORDER_FEE',
    amountAmd: -fee,
    orderId: input.orderId,
    assignmentId: input.assignmentId,
    feeRules: rules,
    lowThresholdAmd: lowThresholdOf(settings),
  })
  return fee
}

interface AssignmentFee {
  driverId: number
  orderId: number | null
  rules: FeeRules
  /** Net charged so far (fee + adjustments), positive drams */
  chargedAmd: number
  refunded: boolean
}

async function assignmentFee(tx: Sql, assignmentId: number): Promise<AssignmentFee | null> {
  const rows = await tx.query<{ driverId: number; orderId: number | null; kind: string; amountAmd: number; feeRules: unknown }>(
    `SELECT "driverId", "orderId", "kind", "amountAmd", "feeRules" FROM "WalletEntry" WHERE "assignmentId" = $1::int ORDER BY "id"`,
    [assignmentId],
  )
  const fee = rows.find((row) => row.kind === 'ORDER_FEE')
  if (!fee) return null
  const rules = (typeof fee.feeRules === 'string' ? JSON.parse(fee.feeRules) : fee.feeRules) as FeeRules
  const chargedAmd = 0 - rows.filter((row) => row.kind === 'ORDER_FEE' || row.kind === 'ORDER_FEE_ADJUSTMENT').reduce((sum, row) => sum + toNumber(row.amountAmd), 0)
  return {
    driverId: toNumber(fee.driverId),
    orderId: fee.orderId === null ? null : toNumber(fee.orderId),
    rules,
    chargedAmd,
    refunded: rows.some((row) => row.kind === 'ORDER_FEE_REFUND'),
  }
}

/**
 * The price became known (agreed by phone) or final (completion): bring the
 * fee for this assignment to what that price costs under the schedule it was
 * accepted under. Charges or returns only the difference; repeatable.
 * No-op for an assignment that was never billed or already refunded.
 */
export async function settleOrderFee(
  tx: Sql,
  assignmentId: number,
  finalPriceAmd: number | null,
  note: string,
  options: { allowDecrease?: boolean } = {},
): Promise<number> {
  const fee = await assignmentFee(tx, assignmentId)
  if (!fee || fee.refunded) return 0
  const target = orderFeeAmd(finalPriceAmd, fee.rules)
  const difference = target - fee.chargedAmd
  // A decrease waiting for an operator's check (the minimum price) is not returned yet
  if (difference === 0 || (difference < 0 && options.allowDecrease === false)) return 0
  await post(tx, {
    driverId: fee.driverId,
    kind: 'ORDER_FEE_ADJUSTMENT',
    amountAmd: -difference,
    orderId: fee.orderId,
    assignmentId,
    note,
    lowThresholdAmd: fee.rules.walletFeeBaseAmd * 2,
  })
  return difference
}

/** Was this assignment charged a fee at all (billing was on when it was accepted)? */
export async function assignmentBilled(tx: Sql, assignmentId: number): Promise<boolean> {
  return (await assignmentFee(tx, assignmentId)) !== null
}

/**
 * An operator cancelled the order, or took it away from the driver, before he
 * arrived at the pickup: everything charged for this assignment goes back.
 * Not called for the driver's own cancel (product decision 2026-11-12).
 */
export async function refundOrderFee(tx: Sql, assignmentId: number, note: string): Promise<number> {
  const fee = await assignmentFee(tx, assignmentId)
  if (!fee || fee.refunded || fee.chargedAmd <= 0) return 0
  await post(tx, { driverId: fee.driverId, kind: 'ORDER_FEE_REFUND', amountAmd: fee.chargedAmd, orderId: fee.orderId, assignmentId, note })
  return fee.chargedAmd
}

/**
 * Dispatch: may this driver be offered an order that costs `requiredAmd`?
 * SQL over `t` (FleetDriverProfile). `null` = billing off, no condition.
 */
export function walletPredicate(p: Params, requiredAmd: number | null): string {
  if (requiredAmd === null) return 'true'
  // balance + the credit an operator allows this driver
  return `COALESCE((SELECT w."balanceAmd" + w."creditLimitAmd" FROM "DriverWallet" w WHERE w."driverId" = t."id"), 0) >= ${p.add(requiredAmd)}::int`
}

/** The driver's statement, newest first; `before` = the last line's id */
export async function entriesOf(db: Sql, driverId: number, limit: number, beforeId: number | null): Promise<WalletEntry[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT e."id", e."kind", e."amountAmd", e."balanceAfterAmd", e."orderId", o."number" AS "orderNumber", e."note", e."createdAt"
       FROM "WalletEntry" e LEFT JOIN "DispatchOrder" o ON o."id" = e."orderId"
      WHERE e."driverId" = $1::int AND ($2::bigint IS NULL OR e."id" < $2::bigint)
      ORDER BY e."id" DESC
      LIMIT $3::int`,
    [driverId, beforeId, Math.min(Math.max(limit, 1), 100)],
  )
  return rows.map((row) => ({
    id: toNumber(row.id),
    kind: String(row.kind) as WalletEntryKind,
    amountAmd: toNumber(row.amountAmd),
    balanceAfterAmd: toNumber(row.balanceAfterAmd),
    orderId: row.orderId === null || row.orderId === undefined ? null : toNumber(row.orderId),
    orderNumber: row.orderNumber === null || row.orderNumber === undefined ? null : String(row.orderNumber),
    note: row.note === null || row.note === undefined ? null : String(row.note),
    createdAt: toDate(row.createdAt),
  }))
}
