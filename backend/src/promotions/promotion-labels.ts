import { PromotionScope } from '@prisma/client'

/**
 * What each placement product is called wherever a person reads it — the Idram
 * page, the driver's history, the admin's review queue. One copy, so the three
 * cannot drift into naming the same purchase three ways.
 */
export const PROMOTION_SCOPE_LABEL: Record<PromotionScope, string> = {
  [PromotionScope.HOME]: 'Իմ քաղաքում վերևում',
  [PromotionScope.AREA]: 'Ամբողջ սպասարկման տարածքում',
}

/** «Առաջխաղացում · Ամբողջ սպասարկման տարածքում · 7 օր» */
export function promotionPaymentTitle(scope: PromotionScope | null, days: number | null): string {
  const parts = ['Առաջխաղացում']
  if (scope) parts.push(PROMOTION_SCOPE_LABEL[scope])
  if (days) parts.push(`${days} օր`)
  return parts.join(' · ')
}
