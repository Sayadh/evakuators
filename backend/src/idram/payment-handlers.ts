import { Injectable } from '@nestjs/common'
import type { PaymentKind, SubscriptionPayment } from '@prisma/client'

/**
 * Products paid through Idram that are owned by a module this one must not
 * import (2026-11-12: the driver-app wallet, owned by live dispatch — which is
 * deliberately deletable with one line in app.module.ts and is never imported
 * from outside its folder).
 *
 * Inversion instead of an import: the owner registers a handler for its
 * `PaymentKind` at bootstrap; IdramService looks it up per bill. A kind with
 * no registered handler is refused at precheck — no money moves for a product
 * nobody in this process can grant.
 */
export interface ExternalPaymentHandler {
  /** Precheck, READ-ONLY: may Idram still charge this bill? */
  isStillPayable(payment: SubscriptionPayment): Promise<boolean>
  /**
   * The money moved (checksum already verified): grant it, idempotently.
   * `true` = granted now, `false` = it had already been granted. Both mean
   * Idram is told OK. Throw only when the bill is not this product's.
   */
  confirm(payment: SubscriptionPayment, source: { provider: string; transactionId: string }): Promise<boolean>
}

@Injectable()
export class PaymentHandlerRegistry {
  private readonly handlers = new Map<PaymentKind, ExternalPaymentHandler>()

  register(kind: PaymentKind, handler: ExternalPaymentHandler): void {
    this.handlers.set(kind, handler)
  }

  get(kind: PaymentKind): ExternalPaymentHandler | undefined {
    return this.handlers.get(kind)
  }
}
