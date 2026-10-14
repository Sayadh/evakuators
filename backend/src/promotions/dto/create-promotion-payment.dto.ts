import { Type } from 'class-transformer'
import { PromotionScope } from '@prisma/client'
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator'
import { FEATURED_MAX_DAYS, FEATURED_MIN_DAYS } from '../../tow-trucks/featured'

/**
 * «Առաջխաղացնել» — a number of days and which product, and nothing else.
 *
 * No amount, for the same reason `CreateSubscriptionPaymentDto` takes none: the
 * payment form is rendered in the driver's own browser, so a field the client
 * could set is a field the client would set. The price comes from
 * `promotionPrice()` on the server.
 *
 * No `towTruckId` either — it comes from the session. A driver may only ever
 * promote themselves.
 *
 * The 1–30 bound here is the shape of the request. Whether THIS driver may buy
 * that many days is a different question — their subscription may end sooner —
 * and it is answered in the service, where the subscription is known.
 */
export class CreatePromotionPaymentDto {
  @Type(() => Number)
  @IsInt({ message: 'Օրերի քանակը պետք է լինի ամբողջ թիվ' })
  @Min(FEATURED_MIN_DAYS, { message: `Նվազագույնը ${FEATURED_MIN_DAYS} օր` })
  @Max(FEATURED_MAX_DAYS, { message: `Առավելագույնը ${FEATURED_MAX_DAYS} օր` })
  days!: number

  /**
   * Which product. Optional, defaulting to «Իմ քաղաքում վերևում», so a page
   * loaded before the second product existed still buys what it showed.
   */
  @IsOptional()
  @IsEnum(PromotionScope, { message: 'Անհայտ առաջխաղացման տեսակ' })
  scope?: PromotionScope
}
