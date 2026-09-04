import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  idramAmountMatches,
  parseIdramBillNo,
  parseIdramCallback,
} from '../src/idram/idram-callback'
import { buildIdramChecksum, idramChecksumMatches } from '../src/idram/idram-checksum'

/**
 * The rules that stand between a POST from anywhere on the internet and a
 * granted subscription. Every case here is one someone could actually send.
 */

const SECRET = 'merchant-secret'
const FIELDS = {
  recAccount: '100000114',
  amount: '3000.00',
  billNo: '1806',
  payerAccount: '200000225',
  transId: '12345678901234',
  transDate: '02/09/2026',
}

describe('buildIdramChecksum', () => {
  it('hashes the seven fields in Idram’s order, with the secret third', () => {
    // Spelled out rather than reusing the implementation's own join: the
    // ORDER is the whole specification, and a test that builds the string the
    // same way the code does would pass no matter how wrong both were.
    const expected = createHash('md5')
      .update(
        ['100000114', '3000.00', SECRET, '1806', '200000225', '12345678901234', '02/09/2026'].join(':'),
        'utf8',
      )
      .digest('hex')

    expect(buildIdramChecksum(FIELDS, SECRET)).toBe(expected)
  })

  it('changes when any single field changes', () => {
    const base = buildIdramChecksum(FIELDS, SECRET)
    expect(buildIdramChecksum({ ...FIELDS, amount: '3000.01' }, SECRET)).not.toBe(base)
    expect(buildIdramChecksum({ ...FIELDS, billNo: '1807' }, SECRET)).not.toBe(base)
    expect(buildIdramChecksum(FIELDS, 'another-secret')).not.toBe(base)
  })
})

describe('idramChecksumMatches', () => {
  it('accepts the checksum Idram would send', () => {
    expect(idramChecksumMatches(buildIdramChecksum(FIELDS, SECRET), FIELDS, SECRET)).toBe(true)
  })

  it('accepts it in upper case — nothing pins which case arrives', () => {
    expect(
      idramChecksumMatches(buildIdramChecksum(FIELDS, SECRET).toUpperCase(), FIELDS, SECRET),
    ).toBe(true)
  })

  it('refuses a checksum computed with the wrong secret', () => {
    // i.e. anyone who does not have our secret key.
    expect(idramChecksumMatches(buildIdramChecksum(FIELDS, 'guessed'), FIELDS, SECRET)).toBe(false)
  })

  it('refuses a tampered amount even with an otherwise valid-looking checksum', () => {
    const forSmallerAmount = buildIdramChecksum({ ...FIELDS, amount: '1.00' }, SECRET)
    expect(idramChecksumMatches(forSmallerAmount, FIELDS, SECRET)).toBe(false)
  })

  it('refuses nonsense without throwing on the length difference', () => {
    expect(idramChecksumMatches('', FIELDS, SECRET)).toBe(false)
    expect(idramChecksumMatches('short', FIELDS, SECRET)).toBe(false)
  })
})

describe('idramAmountMatches', () => {
  it('accepts the same amount in Idram’s two-decimal form', () => {
    expect(idramAmountMatches('3000.00', 3000)).toBe(true)
    expect(idramAmountMatches('3000', 3000)).toBe(true)
  })

  it('REFUSES an amount edited in the browser', () => {
    // The form is in the driver's own page, so nothing stops them setting
    // EDP_AMOUNT to 1 before submitting. This refusal, on Idram's preliminary
    // request, is the entire reason that does not work.
    expect(idramAmountMatches('1', 3000)).toBe(false)
    expect(idramAmountMatches('1.00', 3000)).toBe(false)
    expect(idramAmountMatches('2999.99', 3000)).toBe(false)
  })

  it('refuses an overpayment too — a mismatch is a mismatch', () => {
    expect(idramAmountMatches('3000.01', 3000)).toBe(false)
    expect(idramAmountMatches('30000', 3000)).toBe(false)
  })

  it('refuses anything that is not a plain number', () => {
    expect(idramAmountMatches('3000abc', 3000)).toBe(false)
    expect(idramAmountMatches('3 000', 3000)).toBe(false)
    expect(idramAmountMatches('', 3000)).toBe(false)
    expect(idramAmountMatches('-3000', 3000)).toBe(false)
  })
})

describe('parseIdramBillNo', () => {
  it('reads a plain positive integer', () => {
    expect(parseIdramBillNo('1806')).toBe(1806)
  })

  it('refuses anything else rather than salvaging a number from it', () => {
    // parseInt('12abc') is 12 — a bill number half-understood is a payment
    // credited to the wrong row.
    expect(parseIdramBillNo('12abc')).toBeNull()
    expect(parseIdramBillNo('0')).toBeNull()
    expect(parseIdramBillNo('-5')).toBeNull()
    expect(parseIdramBillNo('1.5')).toBeNull()
    expect(parseIdramBillNo('')).toBeNull()
  })
})

describe('parseIdramCallback', () => {
  it('reads the preliminary request', () => {
    expect(
      parseIdramCallback({
        EDP_PRECHECK: 'YES',
        EDP_BILL_NO: '1806',
        EDP_REC_ACCOUNT: '100000114',
        EDP_AMOUNT: '3000.00',
      }),
    ).toMatchObject({ kind: 'precheck', billNo: '1806' })
  })

  it('reads the payment confirmation', () => {
    expect(
      parseIdramCallback({
        EDP_BILL_NO: '1806',
        EDP_REC_ACCOUNT: '100000114',
        EDP_AMOUNT: '3000.00',
        EDP_PAYER_ACCOUNT: '200000225',
        EDP_TRANS_ID: '12345678901234',
        EDP_TRANS_DATE: '02/09/2026',
        EDP_CHECKSUM: 'abc',
      }),
    ).toMatchObject({ kind: 'confirmation', transId: '12345678901234' })
  })

  it('ignores extra fields instead of rejecting the whole callback', () => {
    // The reason this is not a DTO: the day Idram adds a field, a whitelisting
    // pipe would answer 400 and payments would stop.
    expect(
      parseIdramCallback({
        EDP_PRECHECK: 'YES',
        EDP_BILL_NO: '1806',
        EDP_REC_ACCOUNT: '100000114',
        EDP_AMOUNT: '3000.00',
        EDP_SOMETHING_NEW: 'whatever',
      }),
    ).toMatchObject({ kind: 'precheck' })
  })

  it('refuses a confirmation that is missing any of its parts', () => {
    const complete = {
      EDP_BILL_NO: '1806',
      EDP_REC_ACCOUNT: '100000114',
      EDP_AMOUNT: '3000.00',
      EDP_PAYER_ACCOUNT: '200000225',
      EDP_TRANS_ID: '12345678901234',
      EDP_TRANS_DATE: '02/09/2026',
      EDP_CHECKSUM: 'abc',
    }
    for (const missing of ['EDP_TRANS_ID', 'EDP_CHECKSUM', 'EDP_PAYER_ACCOUNT', 'EDP_TRANS_DATE']) {
      const body: Record<string, unknown> = { ...complete }
      delete body[missing]
      expect(parseIdramCallback(body), `missing ${missing}`).toBeNull()
    }
  })

  it('refuses an unrecognised EDP_PRECHECK value rather than guessing', () => {
    expect(
      parseIdramCallback({
        EDP_PRECHECK: 'MAYBE',
        EDP_BILL_NO: '1806',
        EDP_REC_ACCOUNT: '100000114',
        EDP_AMOUNT: '3000.00',
      }),
    ).toBeNull()
  })

  it('refuses an empty body', () => {
    expect(parseIdramCallback({})).toBeNull()
  })
})
