/**
 * Driver wallet × Idram (2026-11-12): the Nest glue.
 *
 * - `WalletPaymentsRegistrar` hands IdramModule the handler for WALLET_TOPUP
 *   bills (inversion: IdramModule never imports live dispatch).
 * - `WalletPayLinks` signs and checks the short-lived link the app opens in
 *   the phone's browser, and renders the page that carries the driver on to
 *   Idram. The page only POSTs the form of an existing PENDING bill — the
 *   amount comes from our row, never from the link — and Idram still asks us
 *   to confirm the bill and amount before charging (precheck).
 */
import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { PaymentKind } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { IDRAM_PAYMENT_URL } from '../../idram/idram.constants'
import { IdramService } from '../../idram/idram.service'
import { PaymentHandlerRegistry } from '../../idram/payment-handlers'
import { confirmTopup, topupBill, topupPayable } from '../wallet/wallet-topups'
import { LiveDispatchRuntimeHolder } from './runtime.provider'

export const WALLET_PAY_AUDIENCE = 'driver:wallet-pay'
/** Long enough to finish paying on a slow phone, short enough that a forwarded link dies soon */
const PAY_LINK_TTL_SECONDS = 30 * 60
const IDRAM_ORIGIN = new URL(IDRAM_PAYMENT_URL).origin

@Injectable()
export class WalletPaymentsRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: PaymentHandlerRegistry,
    private readonly holder: LiveDispatchRuntimeHolder,
  ) {}

  onModuleInit(): void {
    const db = this.holder.runtime.db
    this.registry.register(PaymentKind.WALLET_TOPUP, {
      isStillPayable: (payment) => topupPayable(db, payment.id),
      confirm: async (payment, source) => confirmTopup(db, payment.id, source, await this.holder.runtime.settings.get()),
    })
  }
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

@Injectable()
export class WalletPayLinks {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly idram: IdramService,
    private readonly holder: LiveDispatchRuntimeHolder,
  ) {}

  get available(): boolean {
    return this.idram.isConfigured
  }

  private get secret(): string {
    return this.config.getOrThrow<string>('driverJwtSecret')
  }

  sign(paymentId: number, driverId: number): Promise<string> {
    return this.jwt.signAsync({ pid: paymentId, sub: driverId }, { secret: this.secret, audience: WALLET_PAY_AUDIENCE, expiresIn: PAY_LINK_TTL_SECONDS })
  }

  /**
   * The HTML for `GET /driver-app/wallet/pay/:paymentId?t=…` — always a page,
   * never an error body — and its own Content-Security-Policy: helmet's
   * default forbids both the inline submit and posting a form to another
   * origin, so this page allows exactly one script (by nonce) and exactly one
   * form target (Idram).
   */
  async page(paymentId: number, token: string | undefined): Promise<{ status: number; html: string; csp: string }> {
    const nonce = randomBytes(16).toString('base64')
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action ${IDRAM_ORIGIN} https://*.idram.am; base-uri 'none'; frame-ancestors 'none'`
    return { ...(await this.render(paymentId, token, nonce)), csp }
  }

  private async render(paymentId: number, token: string | undefined, nonce: string): Promise<{ status: number; html: string }> {
    let payload: { pid: number; sub: number }
    try {
      payload = await this.jwt.verifyAsync<{ pid: number; sub: number }>(token ?? '', { secret: this.secret, audience: WALLET_PAY_AUDIENCE })
    } catch {
      return { status: 403, html: message('Հղման ժամկետն անցել է', 'Վերադարձեք հավելված և կրկին սեղմեք «Համալրել»։') }
    }
    const bill = await topupBill(this.holder.runtime.db, paymentId)
    if (!bill || payload.pid !== paymentId || bill.driverId !== payload.sub) {
      return { status: 404, html: message('Վճարումը չի գտնվել', 'Վերադարձեք հավելված և կրկին փորձեք։') }
    }
    if (bill.status === 'PAID') return { status: 200, html: message('Վճարված է', 'Գումարն արդեն մուտքագրվել է ձեր հաշվին։ Կարող եք վերադառնալ հավելված։') }
    if (bill.status !== 'PENDING') return { status: 410, html: message('Վճարումը չեղարկված է', 'Վերադարձեք հավելված և ստեղծեք նոր համալրում։') }
    const form = this.idram.paymentForm(bill.paymentId, bill.amountAmd, `Evakuators — հաշվի համալրում #${bill.paymentId}`)
    if (!form) return { status: 503, html: message('Վճարումը հիմա հասանելի չէ', 'Փորձեք մի փոքր ուշ կամ դիմեք ադմինիստրատորին։') }
    const inputs = Object.entries(form.fields)
      .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
      .join('')
    return {
      status: 200,
      html: shell(
        'Idram',
        `<h1>${bill.amountAmd.toLocaleString('en-US').replace(/,/g, ' ')} ֏</h1><p>Ուղղորդում ենք Idram…</p>
         <form id="pay" method="POST" action="${escapeHtml(form.action)}">${inputs}<button type="submit">Վճարել Idram-ով</button></form>
         <script nonce="${nonce}">document.getElementById('pay').submit()</script>`,
      ),
    }
  }
}

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="hy"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#f4f6f9;color:#0d2136;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}
main{background:#fff;border-radius:16px;padding:28px;max-width:420px;box-shadow:0 4px 24px rgba(13,33,54,.08)}h1{font-size:28px;margin:0 0 8px}p{color:#5b6b7c;line-height:1.5}
button{margin-top:16px;background:#0d2136;color:#fff;border:0;border-radius:12px;padding:14px 22px;font-size:16px;font-weight:600}</style></head>
<body><main>${body}</main></body></html>`
}

function message(title: string, text: string): string {
  return shell(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p>`)
}
