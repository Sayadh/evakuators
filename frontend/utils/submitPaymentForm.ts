import type { PaymentGatewayForm } from '~/types/subscription'

/**
 * Hands the driver over to the payment provider.
 *
 * A real form POST, built and submitted from script, rather than a link or a
 * `fetch`. The provider's page has to RECEIVE the browser — the driver has to
 * end up looking at Idram, entering their credentials there — so this has to
 * be a top-level navigation carrying POST fields, which is the one thing
 * `navigateTo` and `fetch` cannot do.
 *
 * Values are set through `value =`, never by building an HTML string: a plan
 * title with a quote in it would otherwise break out of the attribute, and
 * that class of bug is not worth being clever about on the page that starts a
 * payment.
 *
 * Returns nothing and never resolves in any meaningful sense — by the time it
 * has run, the browser is leaving.
 */
export function submitPaymentForm(gateway: PaymentGatewayForm): void {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = gateway.action
  // Hidden, because it exists for a fraction of a second and must not flash
  // on screen while the browser tears the page down.
  form.style.display = 'none'

  for (const [name, value] of Object.entries(gateway.fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }

  // Must be in the document for submit() to do anything at all.
  document.body.appendChild(form)
  form.submit()
}
