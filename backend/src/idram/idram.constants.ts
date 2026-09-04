/**
 * Idram's own vocabulary, in one place.
 *
 * Every string here comes from "Idram Payment System merchant interface
 * description" and is spelled exactly as Idram spells it — including the
 * `EDP_` prefix and the reply body. Getting any of them wrong does not produce
 * an error we would see: it produces a payment that silently never completes.
 */

/** Where the driver's browser posts the payment form */
export const IDRAM_PAYMENT_URL = 'https://banking.idram.am/Payment/GetPayment'

/**
 * The exact body Idram requires back from RESULT_URL, "without any html
 * formatting".
 *
 * On the preliminary request, anything else means Idram refuses to let the
 * customer pay at all. On the confirmation, anything else means Idram emails
 * the merchant address instead of considering us notified.
 */
export const IDRAM_OK = 'OK'

/** Interface language for the hosted payment page — the site is Armenian, so the payment page is too */
export const IDRAM_LANGUAGE = 'AM'

/** `EDP_PRECHECK` carries this exact value on the preliminary request, and is absent on the confirmation */
export const IDRAM_PRECHECK_YES = 'YES'
