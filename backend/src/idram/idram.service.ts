import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SubscriptionPaymentStatus, type SubscriptionPayment } from '@prisma/client'
import type { AppConfig } from '../config/configuration'
import { SubscriptionsRepository } from '../subscriptions/subscriptions.repository'
import { SubscriptionsService } from '../subscriptions/subscriptions.service'
import {
  idramAmountMatches,
  parseIdramBillNo,
  parseIdramCallback,
  type IdramCallbackBody,
  type IdramConfirmation,
  type IdramPrecheck,
} from './idram-callback'
import { idramChecksumMatches } from './idram-checksum'
import { isIdramConfigured } from './idram-config'
import { buildIdramPaymentForm } from './idram-payment-form'
import type { PaymentGatewayFormApi } from '../subscriptions/subscription.types'

/** Which name a confirmed payment is stamped with — see SubscriptionPayment.provider */
export const IDRAM_PROVIDER = 'IDRAM'

@Injectable()
export class IdramService {
  private readonly logger = new Logger(IdramService.name)
  private readonly recAccount: string
  private readonly secretKey: string

  constructor(
    config: ConfigService,
    private readonly subscriptions: SubscriptionsService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
  ) {
    const idram = config.getOrThrow<AppConfig['idram']>('idram')
    this.recAccount = idram.recAccount
    this.secretKey = idram.secretKey
  }

  /**
   * Both credentials present. Blank is a normal state — an environment that
   * cannot take payments yet, and therefore one where the paywall stays off
   * too (see `idram-config.ts` for why the predicate itself lives there).
   */
  get isConfigured(): boolean {
    return isIdramConfigured({ recAccount: this.recAccount, secretKey: this.secretKey })
  }

  /**
   * The handoff that starts a payment, or `undefined` when this environment
   * has no merchant credentials.
   *
   * `undefined` is a normal answer, not an error: a deploy without credentials
   * is one that cannot take card payments yet, and the caller shows the
   * request as recorded rather than redirecting the driver somewhere that
   * would refuse them.
   */
  paymentForm(billNo: number, amount: number, description: string): PaymentGatewayFormApi | undefined {
    if (!this.isConfigured) return undefined

    const form = buildIdramPaymentForm({
      recAccount: this.recAccount,
      billNo,
      amount,
      description,
    })
    return { provider: IDRAM_PROVIDER, action: form.action, fields: form.fields }
  }

  /**
   * Answers one callback. `true` means Idram gets "OK".
   *
   * Every refusal is logged at warn or higher, because a refused callback is
   * money not moving — a silence here is a driver whose payment vanished with
   * nothing in the logs to explain it.
   */
  async handleCallback(body: IdramCallbackBody): Promise<boolean> {
    if (!this.isConfigured) {
      // Nothing to verify a signature against, so nothing can be believed.
      this.logger.error('Idram callback received but IDRAM_REC_ACCOUNT/IDRAM_SECRET_KEY are not set')
      return false
    }

    const callback = parseIdramCallback(body)
    if (!callback) {
      this.logger.warn('Idram callback refused: unrecognised body')
      return false
    }

    if (callback.recAccount !== this.recAccount) {
      // The check that keeps environments apart: a callback for someone else's
      // merchant account — a test account, say — must not touch this database.
      this.logger.warn(
        `Idram callback refused: EDP_REC_ACCOUNT ${callback.recAccount} is not ours`,
      )
      return false
    }

    return callback.kind === 'precheck'
      ? this.handlePrecheck(callback)
      : this.handleConfirmation(callback)
  }

  /**
   * "Is this really an order you made, for this amount?" — asked BEFORE any
   * money moves, and answered without changing a thing.
   *
   * Read-only on purpose. This request carries no checksum (the specification
   * gives it none), so it cannot be authenticated at all: anyone who guesses a
   * bill number can send one. That is harmless as long as answering it writes
   * nothing, and it stays harmless only while that remains true.
   *
   * Refusing here is what stops a tampered amount. If the driver edited the
   * form in their browser, this is where the numbers stop agreeing and Idram
   * never takes the money.
   */
  private async handlePrecheck(callback: IdramPrecheck): Promise<boolean> {
    const payment = await this.findPendingPayment(callback.billNo)
    if (!payment) return false

    if (!idramAmountMatches(callback.amount, payment.amount)) {
      this.logger.warn(
        `Idram precheck refused for payment #${payment.id}: amount ${callback.amount} ` +
          `does not match the ${payment.amount} ${payment.currency} we asked for`,
      )
      return false
    }

    this.logger.log(`Idram precheck accepted for payment #${payment.id}`)
    return true
  }

  /**
   * "The money has moved." Verified, then recorded.
   *
   * Order matters: the checksum is checked BEFORE anything is looked up or
   * written, because it is the only thing that makes this message believable.
   * Everything after it is a fact we already knew being matched against a
   * message we now trust.
   */
  private async handleConfirmation(callback: IdramConfirmation): Promise<boolean> {
    if (
      !idramChecksumMatches(
        callback.checksum,
        {
          recAccount: callback.recAccount,
          amount: callback.amount,
          billNo: callback.billNo,
          payerAccount: callback.payerAccount,
          transId: callback.transId,
          transDate: callback.transDate,
        },
        this.secretKey,
      )
    ) {
      this.logger.error(
        `Idram confirmation REFUSED for bill ${callback.billNo}: checksum mismatch ` +
          `(trans ${callback.transId})`,
      )
      return false
    }

    // A gateway retries anything it did not hear "OK" from, so the same
    // transaction arriving twice is ordinary traffic. Already recorded means
    // already done — say OK and change nothing, rather than treating our own
    // success as an error.
    const seen = await this.subscriptionsRepository.findByProviderTransactionId(callback.transId)
    if (seen) {
      this.logger.log(`Idram confirmation replayed for transaction ${callback.transId} — already recorded`)
      return true
    }

    const payment = await this.findPendingPayment(callback.billNo)
    if (!payment) return false

    if (!idramAmountMatches(callback.amount, payment.amount)) {
      // Should be unreachable: the preliminary request already refused a
      // mismatch, so money should never have moved. Checked anyway — this is
      // the last point at which we can refuse to record a wrong number, and
      // "should be unreachable" is not a guarantee when the other side of the
      // conversation is someone else's system.
      this.logger.error(
        `Idram confirmation REFUSED for payment #${payment.id}: paid ${callback.amount}, ` +
          `expected ${payment.amount}`,
      )
      return false
    }

    const confirmed = await this.subscriptions.confirmPayment(payment.id, {
      provider: IDRAM_PROVIDER,
      transactionId: callback.transId,
    })

    if (!confirmed) {
      // Lost a race with another confirmation of the same bill. The money is
      // accounted for either way, so Idram is told OK — repeating the callback
      // would not improve anything.
      this.logger.warn(
        `Idram confirmation for payment #${payment.id} found it already decided (trans ${callback.transId})`,
      )
      return true
    }

    this.logger.warn(
      `Idram payment confirmed: #${payment.id}, ${payment.amount} ${payment.currency}, ` +
        `trans ${callback.transId} from ${callback.payerAccount}`,
    )
    return true
  }

  /**
   * The PENDING payment this bill number refers to, or `null` with the reason
   * logged.
   *
   * PENDING and no other status: a cancelled order must not become paid
   * because a callback arrived late, and an already-paid one is handled by the
   * transaction-id check above, not here.
   */
  private async findPendingPayment(billNo: string): Promise<SubscriptionPayment | null> {
    const id = parseIdramBillNo(billNo)
    if (id === null) {
      this.logger.warn(`Idram callback refused: EDP_BILL_NO "${billNo}" is not a bill number`)
      return null
    }

    const payment = await this.subscriptionsRepository.findById(id)
    if (!payment) {
      this.logger.warn(`Idram callback refused: no payment #${id}`)
      return null
    }
    if (payment.status !== SubscriptionPaymentStatus.PENDING) {
      this.logger.warn(`Idram callback refused: payment #${id} is ${payment.status}, not PENDING`)
      return null
    }
    return payment
  }
}
