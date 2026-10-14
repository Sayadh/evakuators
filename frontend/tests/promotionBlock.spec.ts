import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { promotionPriceFrom } from '~/utils/promotionPrice'
import type { PromotionPriceBracket } from '~/types/promotion'

/**
 * The driver's own placement block.
 *
 * The price shown here and the price charged by the server have to be the same
 * number, and the way that is guaranteed is that this screen holds no numbers:
 * the ladder arrives with the status. These tests pin that, and the three rules
 * whose failure is silent — a block rendered to a deactivated driver, a block
 * that sells past the subscription, a «Վճարել» that sends an amount.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const block = readFileSync(`${ROOT}components/dashboard/PromotionBlock.vue`, 'utf8')
const repository = readFileSync(`${ROOT}repositories/myPromotion.repository.ts`, 'utf8')

/** The server's own ladder, as it arrives on the wire */
const BRACKETS: PromotionPriceBracket[] = [
  { fromDay: 1, toDay: 5, pricePerDay: 400 },
  { fromDay: 6, toDay: 10, pricePerDay: 300 },
  { fromDay: 11, toDay: 20, pricePerDay: 150 },
  { fromDay: 21, toDay: 30, pricePerDay: 100 },
]

describe('pricing a day count from the server’s ladder', () => {
  it('agrees with the backend on the numbers that were agreed', () => {
    expect(promotionPriceFrom(BRACKETS, 1)).toBe(400)
    expect(promotionPriceFrom(BRACKETS, 17)).toBe(4_550)
    expect(promotionPriceFrom(BRACKETS, 30)).toBe(6_000)
  })

  it('shows no price for a day count the ladder does not reach', () => {
    // Better than a total that quietly stops at day 30 — the server would
    // refuse the order, and a number on screen that cannot be paid is worse
    // than no number.
    expect(promotionPriceFrom(BRACKETS, 31)).toBeNull()
    expect(promotionPriceFrom(BRACKETS, 0)).toBeNull()
    expect(promotionPriceFrom(BRACKETS, 2.5)).toBeNull()
  })

  it('holds no prices of its own', () => {
    // A second copy of a price list is a second price list, and the one that
    // goes stale is the one on the screen.
    expect(block).not.toMatch(/\b400\b/)
    expect(block).not.toMatch(/\b6000\b/)
    expect(block).not.toMatch(/\b700\b/)
    expect(block).not.toMatch(/\b11000\b/)
    expect(block).toContain('promotionPriceFrom(product.value.brackets, days.value)')
  })
})

describe('the block’s three rules', () => {
  it('renders nothing for a deactivated listing', () => {
    // `visible` is false only then, and the whole block is gated on it rather
    // than merely disabled — selling a position on a site the driver is not on
    // would be taking money for something nobody can see.
    expect(block).toContain('v-if="loading || status?.visible"')
  })

  it('still shows the block without a subscription, and sells nothing', () => {
    expect(block).toContain("status.blockedReason === 'no-subscription'")
    expect(block).toContain('ակտիվ բաժանորդագրություն')
  })

  it('never offers more days than the server says are on sale', () => {
    expect(block).toContain(':max="product.maxDays"')
    expect(block).toMatch(/days\.value <= \(product\.value\?\.maxDays \?\? 0\)/)
  })
})

describe('the request', () => {
  it('sends days and never an amount', () => {
    // The backend's ValidationPipe runs with `forbidNonWhitelisted`, so an
    // amount would be rejected rather than ignored — but the reason it is not
    // sent is that the price is not this screen's to decide.
    expect(repository).toContain('body: { days, scope }')
    // The comment above it is allowed to NAME the field it does not send.
    expect(repository).not.toMatch(/body: \{[^}]*amount/)
  })

  it('takes the fresh status from the refresh response rather than re-reading', () => {
    // One round trip, and no window where the screen and the server disagree
    // about how many refreshes are left.
    expect(block).toContain('status.value = await myPromotionRepository.refresh()')
  })
})

describe('the two products', () => {
  it('offers both, by the names agreed with the operator', () => {
    expect(block).toContain('Իմ քաղաքում վերևում')
    expect(block).toContain('Ամբողջ սպասարկման տարածքում')
  })

  it('reads the AREA product from `area` and HOME from the top level', () => {
    expect(block).toContain("if (which === 'AREA') return current.area")
    expect(block).toContain('maxDays: current.maxDays, brackets: current.brackets')
  })

  it('sends the chosen product with the order', () => {
    expect(block).toContain('createPayment(days.value, scope.value)')
  })

  it('keeps the refresh button for a driver holding only the AREA product', () => {
    expect(block).toContain('status.value?.activeUntil || status.value?.area.activeUntil')
    expect(block).toContain('v-if="anyActive"')
  })
})

describe('the placement history', () => {
  it('loads with the status, and a failed history does not fail the block', () => {
    expect(block).toContain('myPromotionRepository.listPayments().catch(() => payments.value)')
  })

  it('lists every order with its title, price, date and status', () => {
    expect(block).toContain('Վճարումների պատմություն')
    expect(block).toContain('{{ payment.title }}')
    expect(block).toContain('PAYMENT_STATUS_LABELS[payment.status]')
  })

  it('reads its own endpoint, never the subscription one', () => {
    expect(repository).toContain("apiFetch<PromotionPayment[]>('/my/promotion/payments'")
  })
})

describe('the admin card', () => {
  const admin = readFileSync(`${ROOT}pages/admin/index.vue`, 'utf8')

  it('names both products, so an AREA-only driver is visibly promoted', () => {
    expect(admin).toContain('Առաջխաղացում · Իմ քաղաքում')
    expect(admin).toContain('v-if="truck.areaFeaturedUntil"')
    expect(admin).toContain('Առաջխաղացում · Ամբողջ տարածքում')
  })
})

describe('who the block sells to', () => {
  it('explains, and sells nothing to, a specialist vehicle', () => {
    expect(block).toContain("status.blockedReason === 'not-listed'")
    expect(block).toContain('քաղաքների էջերում չի ցուցադրվում')
  })

  it('offers only the area product to a driver whose base is no town', () => {
    expect(block).toContain("option.scope !== 'HOME' || status.value?.homeAvailable !== false")
    expect(block).toContain('v-for="option in offeredProducts"')
  })

  it('tells a HOME holder buying AREA that their home days are kept, not lost', () => {
    expect(block).toContain('մնացած օրերը չեն կորչի')
    expect(block).not.toContain('զուգահեռ')
  })
})
