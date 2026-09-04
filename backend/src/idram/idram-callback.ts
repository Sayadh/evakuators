import { IDRAM_PRECHECK_YES } from './idram.constants'

/**
 * Reading Idram's two callbacks off the wire, as pure functions.
 *
 * Both arrive at the SAME url (RESULT_URL) as `x-www-form-urlencoded`, told
 * apart only by `EDP_PRECHECK` being present on the first. Everything here
 * takes a plain record of strings and returns a decision, so the rules can be
 * tested without an HTTP server, a database or a signature — the same reason
 * every other decision in this codebase lives in its own function.
 *
 * ## Why the body is not a validated DTO
 *
 * The global `ValidationPipe` runs with `forbidNonWhitelisted` (see main.ts),
 * which REJECTS a request carrying any property the DTO does not declare. For
 * our own endpoints that is exactly right. For a third party's callback it is
 * a trap: the day Idram adds a field, the pipe would answer 400, Idram would
 * never hear "OK", and payments would stop — for a change that should have
 * been harmless. So the controller takes the raw record (which the pipe skips,
 * having no class to validate against) and validation happens here, explicitly.
 */

export type IdramCallbackBody = Record<string, unknown>

export interface IdramPrecheck {
  kind: 'precheck'
  billNo: string
  recAccount: string
  amount: string
}

export interface IdramConfirmation {
  kind: 'confirmation'
  billNo: string
  recAccount: string
  payerAccount: string
  amount: string
  transId: string
  transDate: string
  checksum: string
}

export type IdramCallback = IdramPrecheck | IdramConfirmation

/** A present, non-empty string field, or `null` — form bodies arrive as strings or not at all */
function field(body: IdramCallbackBody, name: string): string | null {
  const value = body[name]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Which of the two callbacks this is, with its fields — or `null` when the
 * body is not a well-formed callback at all.
 *
 * `null` covers a missing field just as much as a hand-crafted POST from
 * somewhere else, and both get the same answer: not "OK". There is deliberately
 * no partial success here; a confirmation missing its transaction id is not a
 * confirmation.
 */
export function parseIdramCallback(body: IdramCallbackBody): IdramCallback | null {
  const billNo = field(body, 'EDP_BILL_NO')
  const recAccount = field(body, 'EDP_REC_ACCOUNT')
  const amount = field(body, 'EDP_AMOUNT')
  if (!billNo || !recAccount || !amount) return null

  // Present at all means preliminary. The specification sets it to "YES", and
  // anything else in that field is a message we do not understand — refused
  // rather than guessed at, since guessing wrong means confirming a payment
  // that has not happened.
  const precheck = field(body, 'EDP_PRECHECK')
  if (precheck !== null) {
    return precheck === IDRAM_PRECHECK_YES ? { kind: 'precheck', billNo, recAccount, amount } : null
  }

  const payerAccount = field(body, 'EDP_PAYER_ACCOUNT')
  const transId = field(body, 'EDP_TRANS_ID')
  const transDate = field(body, 'EDP_TRANS_DATE')
  const checksum = field(body, 'EDP_CHECKSUM')
  if (!payerAccount || !transId || !transDate || !checksum) return null

  return { kind: 'confirmation', billNo, recAccount, amount, payerAccount, transId, transDate, checksum }
}

/**
 * The bill number Idram echoes back is our `SubscriptionPayment.id`, so it has
 * to survive the round trip as a positive integer — `"12"` and nothing else.
 *
 * Strict on purpose: `Number("12abc")` is NaN but `parseInt("12abc")` is 12,
 * and a bill number we half-understood is a payment credited to the wrong row.
 */
export function parseIdramBillNo(billNo: string): number | null {
  if (!/^\d+$/.test(billNo)) return null
  const id = Number(billNo)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/**
 * Whether the amount Idram is about to charge (or has charged) is exactly what
 * we asked for.
 *
 * **This is the single most important check in the integration.** The payment
 * form lives in the driver's own browser, so nothing stops them editing
 * `EDP_AMOUNT` to 1 before submitting it. Idram then asks us, in the
 * preliminary callback, whether that is really the order — and refusing here
 * is the entire reason a driver cannot buy four months for one dram.
 *
 * Idram sends `"3000.00"`; we store whole drams as an integer. Compared
 * numerically, and required to be EXACT — an underpayment is obviously
 * refused, and an overpayment is refused too, because a mismatch means
 * something is wrong with the order rather than something generous.
 */
export function idramAmountMatches(received: string, expectedWholeDrams: number): boolean {
  if (!/^\d+(\.\d+)?$/.test(received)) return false
  const amount = Number(received)
  return Number.isFinite(amount) && amount === expectedWholeDrams
}
