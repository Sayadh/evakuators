import { describe, expect, it } from 'vitest'
import { blankOrderForm, buildPreOrderBody, preOrderFormProblem } from '~/utils/orderForm'
import { preOrderRequirementChips, preOrderStateLabel, preOrderVehicle } from '~/utils/preOrders'

const filled = () => ({
  ...blankOrderForm(),
  pickupAddress: 'Վորտեքս',
  destinationAddress: 'Աբովյան',
  make: 'Toyota',
  weightKg: '1600',
  problemDescription: '  Ռոլիկներ պետք են  ',
  wheelsRoll: false as const,
  wheelSkatesCount: '4' as const,
})

describe('pre-order form (shared OrderFormState)', () => {
  it('needs no phone, and never sends plate, price or referrer', () => {
    const built = buildPreOrderBody({ ...filled(), plate: '01AA001', pricingMode: 'FIXED', quotedPriceAmd: '9000', referrerDriverId: 3 })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.body).toMatchObject({
      pickup: { address: 'Վորտեքս', latitude: null, precision: null },
      destination: { address: 'Աբովյան' },
      vehicle: { make: 'Toyota', model: null, weightKg: 1600 },
      requirements: { wheelsRoll: false, needsWheelSkates: true, wheelSkatesCount: 4 },
      comment: 'Ռոլիկներ պետք են',
      customerPhone: null,
    })
    expect(JSON.stringify(built.body)).not.toMatch(/01AA001|pricing|referrer|plate|deadline/)
  })

  it('normalises an optional phone and rejects a wrong one', () => {
    const ok = buildPreOrderBody({ ...filled(), customerPhone: '091 00 00 01' })
    expect(ok.ok && ok.body.customerPhone).toBe('+37491000001')
    expect(preOrderFormProblem({ ...filled(), customerPhone: '12' })).toMatch(/հեռախոսը սխալ/)
  })

  it('same address, precision and weight rules as an order', () => {
    expect(preOrderFormProblem({ ...filled(), pickupAddress: '' })).toMatch(/հասցեն/)
    expect(preOrderFormProblem({ ...filled(), pickupCoords: '40.17, 44.51' })).toMatch(/հաստատվա/)
    expect(preOrderFormProblem({ ...filled(), weightKg: '50' })).toMatch(/Քաշը/)
  })

  it('where it goes is required — the description, coordinates alone are not enough', () => {
    expect(preOrderFormProblem({ ...filled(), destinationAddress: '' })).toMatch(/ուր պետք է տանել/)
    expect(preOrderFormProblem({ ...filled(), destinationAddress: ' ', destinationCoords: '40.2, 44.6' })).toMatch(/ուր պետք է տանել/)
    expect(buildPreOrderBody({ ...filled(), destinationAddress: '' }).ok).toBe(false)
    expect(buildPreOrderBody({ ...filled(), pickupCoords: 'abc', pickupPrecision: 'EXACT' }).ok).toBe(false)
  })
})

describe('wheels that do not roll = wheel skates (2026-11-17)', () => {
  it('«Ոչ» asks for skates (strict) and keeps the optional count; anything else sends neither', () => {
    const no = buildPreOrderBody({ ...filled(), wheelsRoll: false, wheelSkatesCount: '' })
    expect(no.ok && no.body.requirements).toMatchObject({ wheelsRoll: false, needsWheelSkates: true, wheelSkatesCount: null })
    for (const wheelsRoll of [true, null] as const) {
      const built = buildPreOrderBody({ ...filled(), wheelsRoll, wheelSkatesCount: '4' })
      expect(built.ok && built.body.requirements).toMatchObject({ wheelsRoll, needsWheelSkates: null, wheelSkatesCount: null })
    }
  })

  it('a locked gearbox asks for skates too, with the optional count', () => {
    const built = buildPreOrderBody({ ...filled(), wheelsRoll: true, gearboxLocked: true, wheelSkatesCount: '2' })
    expect(built.ok && built.body.requirements).toMatchObject({ gearboxLocked: true, needsWheelSkates: true, wheelSkatesCount: 2 })
    const free = buildPreOrderBody({ ...filled(), wheelsRoll: true, gearboxLocked: false, wheelSkatesCount: '2' })
    expect(free.ok && free.body.requirements).toMatchObject({ needsWheelSkates: null, wheelSkatesCount: null })
  })
})

describe('pre-order display helpers', () => {
  const base = {
    vehicle: { make: 'Toyota', model: 'Camry', weightKg: 1600 },
    requirements: { wheelsRoll: false, steeringLocked: null, gearboxLocked: true, needsManipulator: null, needsWheelSkates: true, wheelSkatesCount: 2 },
  }
  it('vehicle and chips', () => {
    expect(preOrderVehicle(base)).toBe('Toyota Camry · 1600 կգ')
    expect(preOrderVehicle({ vehicle: { make: null, model: null, weightKg: null } })).toBe('')
    expect(preOrderRequirementChips(base)).toEqual(['Անիվները չեն պտտվում · ռոլիկներ ×2', 'Տուփը փակ'])
  })
  it('state', () => {
    expect(preOrderStateLabel({ status: 'OPEN' }).tone).toBe('success')
    expect(preOrderStateLabel({ status: 'CLOSED' }).text).toBe('Փակված')
  })
})
