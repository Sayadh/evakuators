import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * The signature on Idram's payment confirmation, and the only reason we can
 * believe the message came from Idram at all.
 *
 * ## The field order is not negotiable
 *
 * MD5 of these seven values joined by a colon, in exactly this order — note
 * the secret sits THIRD, in the middle, which is the detail that catches
 * everyone who assumes it is appended at the end:
 *
 *     EDP_REC_ACCOUNT : EDP_AMOUNT : SECRET_KEY : EDP_BILL_NO :
 *     EDP_PAYER_ACCOUNT : EDP_TRANS_ID : EDP_TRANS_DATE
 *
 * ## Why the raw strings, never re-formatted values
 *
 * The hash is over the exact characters Idram sent. Their amount arrives as
 * `"3000.00"`; ours is the integer `3000`. Re-serialising our own value into
 * the string would produce `"3000"` and a hash that never matches, for a
 * payment that is perfectly valid. So this function takes strings, off the
 * wire, and the numeric comparison happens separately (see
 * `idram-callback.ts`).
 *
 * MD5 is not a choice we get to make — it is what the provider specifies. It
 * is used here as a shared-secret MAC over data we also verify by other means
 * (the bill exists, is PENDING, and the amount matches), not as the sole
 * defence.
 */
export interface IdramChecksumFields {
  recAccount: string
  amount: string
  billNo: string
  payerAccount: string
  transId: string
  transDate: string
}

export function buildIdramChecksum(fields: IdramChecksumFields, secretKey: string): string {
  const payload = [
    fields.recAccount,
    fields.amount,
    secretKey,
    fields.billNo,
    fields.payerAccount,
    fields.transId,
    fields.transDate,
  ].join(':')

  return createHash('md5').update(payload, 'utf8').digest('hex')
}

/**
 * Whether the checksum Idram sent matches the one we compute.
 *
 * Case-insensitive, because a hex digest is equally correct in either case and
 * nothing in the specification pins which one arrives.
 *
 * Compared with `timingSafeEqual` rather than `===`. The practical risk of
 * leaking a hash comparison byte by byte is small, but this is the check that
 * stands between a stranger's POST and a granted subscription, and constant
 * time costs nothing here.
 */
export function idramChecksumMatches(
  received: string,
  fields: IdramChecksumFields,
  secretKey: string,
): boolean {
  const expected = buildIdramChecksum(fields, secretKey)
  const receivedBuffer = Buffer.from(received.trim().toLowerCase(), 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')

  // timingSafeEqual throws on a length mismatch, which is itself a mismatch —
  // and a length difference leaks nothing an attacker did not already know.
  if (receivedBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(receivedBuffer, expectedBuffer)
}
