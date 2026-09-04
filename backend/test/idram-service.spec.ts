import 'reflect-metadata'
import type { ConfigService } from '@nestjs/config'
import { SubscriptionPaymentStatus } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { buildIdramChecksum } from '../src/idram/idram-checksum'
import { IdramService } from '../src/idram/idram.service'
import type { SubscriptionsRepository } from '../src/subscriptions/subscriptions.repository'
import type { SubscriptionsService } from '../src/subscriptions/subscriptions.service'

/**
 * What the RESULT endpoint actually answers, callback by callback.
 *
 * `true` here is the literal "OK" Idram needs: on the preliminary request it
 * is what lets the charge happen at all, and on the confirmation it is what
 * stops Idram emailing us instead. So every `false` below is a payment that
 * does not happen, deliberately.
 */

const REC_ACCOUNT = '100000114'
const SECRET = 'merchant-secret'

interface Options {
  payment?: {
    id: number
    amount: number
    status: SubscriptionPaymentStatus
  } | null
  alreadySeenTransaction?: boolean
  confirmReturns?: unknown
  configured?: boolean
}

function build(options: Options = {}) {
  const payment =
    options.payment === undefined
      ? { id: 1806, amount: 3000, status: SubscriptionPaymentStatus.PENDING }
      : options.payment

  const confirmPayment = vi.fn(async () =>
    options.confirmReturns === undefined ? { id: payment?.id ?? 1806 } : options.confirmReturns,
  )

  const subscriptions = { confirmPayment } as unknown as SubscriptionsService
  const repository = {
    findById: vi.fn(async () => (payment ? { ...payment, currency: 'AMD' } : null)),
    findByProviderTransactionId: vi.fn(async () =>
      options.alreadySeenTransaction ? { id: 1806 } : null,
    ),
  } as unknown as SubscriptionsRepository

  const config = {
    getOrThrow: () =>
      options.configured === false
        ? { recAccount: '', secretKey: '' }
        : { recAccount: REC_ACCOUNT, secretKey: SECRET },
  } as unknown as ConfigService

  return { service: new IdramService(config, subscriptions, repository), confirmPayment }
}

const CONFIRMATION_FIELDS = {
  recAccount: REC_ACCOUNT,
  amount: '3000.00',
  billNo: '1806',
  payerAccount: '200000225',
  transId: '12345678901234',
  transDate: '02/09/2026',
}

function confirmationBody(overrides: Record<string, string> = {}): Record<string, string> {
  const fields = { ...CONFIRMATION_FIELDS, ...overrides }
  return {
    EDP_BILL_NO: fields.billNo,
    EDP_REC_ACCOUNT: fields.recAccount,
    EDP_AMOUNT: fields.amount,
    EDP_PAYER_ACCOUNT: fields.payerAccount,
    EDP_TRANS_ID: fields.transId,
    EDP_TRANS_DATE: fields.transDate,
    EDP_CHECKSUM: overrides.checksum ?? buildIdramChecksum(fields, SECRET),
  }
}

const precheckBody = (amount = '3000.00', billNo = '1806'): Record<string, string> => ({
  EDP_PRECHECK: 'YES',
  EDP_BILL_NO: billNo,
  EDP_REC_ACCOUNT: REC_ACCOUNT,
  EDP_AMOUNT: amount,
})

describe('IdramService — the preliminary request', () => {
  it('accepts an order that exists, is pending, and matches the amount', async () => {
    const { service } = build()
    await expect(service.handleCallback(precheckBody())).resolves.toBe(true)
  })

  it('REFUSES a tampered amount, which is what stops a 1-dram subscription', async () => {
    const { service } = build()
    await expect(service.handleCallback(precheckBody('1.00'))).resolves.toBe(false)
  })

  it('refuses a bill number that is not ours', async () => {
    const { service } = build({ payment: null })
    await expect(service.handleCallback(precheckBody('3000.00', '999999'))).resolves.toBe(false)
  })

  it('refuses an order that is no longer pending', async () => {
    const { service } = build({
      payment: { id: 1806, amount: 3000, status: SubscriptionPaymentStatus.CANCELLED },
    })
    await expect(service.handleCallback(precheckBody())).resolves.toBe(false)
  })

  it('writes nothing — it is a question, not an instruction', async () => {
    // This request carries no checksum, so anyone can send one. That is only
    // safe while answering it changes nothing.
    const { service, confirmPayment } = build()
    await service.handleCallback(precheckBody())
    expect(confirmPayment).not.toHaveBeenCalled()
  })
})

describe('IdramService — the payment confirmation', () => {
  it('confirms a correctly signed payment', async () => {
    const { service, confirmPayment } = build()
    await expect(service.handleCallback(confirmationBody())).resolves.toBe(true)
    expect(confirmPayment).toHaveBeenCalledWith(1806, {
      provider: 'IDRAM',
      transactionId: '12345678901234',
    })
  })

  it('REFUSES a forged callback, and never looks the payment up', async () => {
    const { service, confirmPayment } = build()
    await expect(
      service.handleCallback(confirmationBody({ checksum: 'f'.repeat(32) })),
    ).resolves.toBe(false)
    expect(confirmPayment).not.toHaveBeenCalled()
  })

  it('refuses a callback for someone else’s merchant account', async () => {
    // What keeps a test-account callback out of the production database.
    const { service, confirmPayment } = build()
    const body = confirmationBody()
    body.EDP_REC_ACCOUNT = '999999999'
    await expect(service.handleCallback(body)).resolves.toBe(false)
    expect(confirmPayment).not.toHaveBeenCalled()
  })

  it('answers OK to a replayed transaction WITHOUT confirming twice', async () => {
    // A gateway retries anything it did not hear OK from. Treating that as an
    // error would grant a second month for one payment.
    const { service, confirmPayment } = build({ alreadySeenTransaction: true })
    await expect(service.handleCallback(confirmationBody())).resolves.toBe(true)
    expect(confirmPayment).not.toHaveBeenCalled()
  })

  it('answers OK when it loses a race — the money is accounted for either way', async () => {
    const { service } = build({ confirmReturns: null })
    await expect(service.handleCallback(confirmationBody())).resolves.toBe(true)
  })

  it('refuses a confirmation whose amount does not match the order', async () => {
    const { service, confirmPayment } = build()
    await expect(service.handleCallback(confirmationBody({ amount: '1.00' }))).resolves.toBe(false)
    expect(confirmPayment).not.toHaveBeenCalled()
  })
})

describe('IdramService — no credentials', () => {
  it('refuses everything rather than believing a signature it cannot check', async () => {
    const { service } = build({ configured: false })
    expect(service.isConfigured).toBe(false)
    await expect(service.handleCallback(precheckBody())).resolves.toBe(false)
    await expect(service.handleCallback(confirmationBody())).resolves.toBe(false)
  })

  it('offers no payment form, so nothing hands a driver to a provider we cannot verify', () => {
    const { service } = build({ configured: false })
    expect(service.paymentForm(1, 3000, 'plan')).toBeUndefined()
  })
})

describe('IdramService.paymentForm', () => {
  it('builds the form with our account and the bill number the callbacks come back with', () => {
    const { service } = build()
    const form = service.paymentForm(1806, 3000, '1 ամսվա բաժանորդագրություն')

    expect(form).toMatchObject({
      provider: 'IDRAM',
      action: 'https://banking.idram.am/Payment/GetPayment',
      fields: {
        EDP_REC_ACCOUNT: REC_ACCOUNT,
        EDP_BILL_NO: '1806',
        EDP_AMOUNT: '3000',
        EDP_LANGUAGE: 'AM',
      },
    })
  })

  it('never puts the secret key in something the browser receives', () => {
    const { service } = build()
    expect(JSON.stringify(service.paymentForm(1, 3000, 'plan'))).not.toContain(SECRET)
  })
})
