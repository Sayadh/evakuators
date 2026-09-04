import { IDRAM_LANGUAGE, IDRAM_PAYMENT_URL } from './idram.constants'

/**
 * The form the driver's browser posts to Idram to start a payment.
 *
 * Returned to the frontend as data rather than rendered as HTML here: the
 * browser has to do the POST (that is what carries the driver to Idram's
 * page), and handing it a blob of markup to inject would be both harder to
 * test and a needless place for HTML to go wrong.
 *
 * ## Nothing here is trusted on the way back
 *
 * Every field in this form is under the driver's control the moment it reaches
 * their browser — including the amount. That is fine, and it is why Idram asks
 * us to confirm the order before charging it: the values that matter are
 * checked against our own row in the preliminary callback (see
 * `idramAmountMatches`). This function's job is only to describe the intended
 * payment, not to secure it.
 */
export interface IdramPaymentForm {
  /** Where the browser must POST — Idram's hosted payment page */
  action: string
  /** Hidden form fields, exactly as Idram names them */
  fields: Record<string, string>
}

export interface IdramPaymentFormInput {
  /** Our IdramID */
  recAccount: string
  /** SubscriptionPayment.id — what comes back as EDP_BILL_NO on both callbacks */
  billNo: number
  /** Whole drams */
  amount: number
  /** Shown to the driver on Idram's page */
  description: string
}

export function buildIdramPaymentForm(input: IdramPaymentFormInput): IdramPaymentForm {
  return {
    action: IDRAM_PAYMENT_URL,
    fields: {
      EDP_LANGUAGE: IDRAM_LANGUAGE,
      EDP_REC_ACCOUNT: input.recAccount,
      EDP_AMOUNT: String(input.amount),
      EDP_BILL_NO: String(input.billNo),
      EDP_DESCRIPTION: input.description,
    },
  }
}
