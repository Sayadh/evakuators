import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { OpsOrder } from '~/types/opsDispatch'
import { buildOrderBody, orderEditBody, orderFormFromOrder, orderFormLocks } from '~/utils/orderForm'

function order(overrides: Partial<OpsOrder> = {}): OpsOrder {
  return {
    id: 6,
    number: 'EV-000006',
    source: 'ADMIN',
    status: 'DRAFT',
    attentionKind: null,
    statusBeforeAttention: null,
    version: 3,
    termsVersion: 1,
    customer: { phone: '+37499999999', name: null },
    pickup: { latitude: 40.1, longitude: 44.5, address: 'Maisv', precision: 'EXACT' },
    destination: { latitude: null, longitude: null, address: 'Komitas' },
    vehicle: { make: 'Mercedes', model: null, plate: null, weightKg: 15000 },
    problemDescription: '',
    requirements: { wheelsRoll: false, steeringLocked: true, gearboxLocked: false, needsManipulator: false, needsWheelSkates: false, wheelSkatesCount: null, overridden: false, overrideNote: null },
    price: { mode: 'NEGOTIATION_REQUIRED', currency: 'AMD', quotedAmd: null, agreedAmd: null, confirmed: false, confirmedAt: null },
    payment: { status: 'UNKNOWN', updatedAt: null },
    assignedDriverId: null,
    pickupToDestination: null,
    cancel: null,
    internalNote: null,
    timestamps: {},
    ...overrides,
  } as OpsOrder
}

describe('orderEditBody', () => {
  it('sends nothing when nothing changed — the pre-filled form round-trips', () => {
    const o = order()
    expect(orderEditBody(orderFormFromOrder(o), orderFormFromOrder(o), orderFormLocks(o))).toEqual({ ok: true, body: null })
  })

  it('sends only the changed groups', () => {
    const o = order()
    const next = { ...orderFormFromOrder(o), destinationAddress: 'Komitas 5', weightKg: '2000' }
    const result = orderEditBody(orderFormFromOrder(o), next, orderFormLocks(o))
    expect(result.ok && result.body).toEqual({
      destination: { latitude: null, longitude: null, address: 'Komitas 5' },
      vehicle: { make: 'Mercedes', model: null, plate: null, weightKg: 2000 },
    })
  })

  it('assigned: never sends a locked group, and drops the weight from the vehicle (the backend refuses it by presence)', () => {
    const o = order({ status: 'ASSIGNED', assignedDriverId: 5 })
    const next = { ...orderFormFromOrder(o), plate: '01AA001', pickupAddress: 'elsewhere', steeringLocked: false, weightKg: '9000' }
    const result = orderEditBody(orderFormFromOrder(o), next, orderFormLocks(o))
    expect(result.ok && result.body).toEqual({ vehicle: { make: 'Mercedes', model: null, plate: '01AA001' } })
  })

  it('assigned FIXED: the price can move, the type cannot', () => {
    const o = order({ status: 'ASSIGNED', assignedDriverId: 5, price: { mode: 'FIXED', currency: 'AMD', quotedAmd: 15000, agreedAmd: null, confirmed: false, confirmedAt: null } })
    const next = { ...orderFormFromOrder(o), quotedPriceAmd: '18000' }
    const result = orderEditBody(orderFormFromOrder(o), next, orderFormLocks(o))
    expect(result.ok && result.body).toEqual({ pricing: { mode: 'FIXED', quotedPriceAmd: 18000 } })
  })

  it('closed: only the internal note, even if old data fails today\'s rules', () => {
    const o = order({ status: 'COMPLETED', vehicle: { make: null, model: null, plate: null, weightKg: 50 } })
    const next = { ...orderFormFromOrder(o), internalNote: ' paid cash ', customerName: 'Ani' }
    expect(orderEditBody(orderFormFromOrder(o), next, orderFormLocks(o))).toEqual({ ok: true, body: { internalNote: 'paid cash' } })
  })

  it('validation still applies to an open order', () => {
    const o = order()
    const result = orderEditBody(orderFormFromOrder(o), { ...orderFormFromOrder(o), customerPhone: '123' }, orderFormLocks(o))
    expect(result.ok).toBe(false)
  })
})

describe('pickup precision (2026-11-17)', () => {
  it('coordinates without «exact or approximate» are refused; the choice travels with the point', () => {
    const o = order()
    const form = { ...orderFormFromOrder(o), pickupPrecision: '' as const }
    expect(buildOrderBody(form)).toMatchObject({ ok: false })
    const exact = buildOrderBody({ ...form, pickupPrecision: 'EXACT' })
    expect(exact.ok && exact.body.pickup).toMatchObject({ latitude: 40.1, longitude: 44.5, precision: 'EXACT' })
  })

  it('an address-only pickup needs no choice and sends none', () => {
    const form = { ...orderFormFromOrder(order({ pickup: { latitude: null, longitude: null, address: 'Maisv' } })), pickupPrecision: 'EXACT' as const }
    const built = buildOrderBody(form)
    expect(built.ok && built.body.pickup).toMatchObject({ latitude: null, precision: null })
  })

  it('changing only the precision is an edit of the pickup', () => {
    const o = order({ pickup: { latitude: 40.1, longitude: 44.5, address: 'Maisv', precision: 'APPROXIMATE' } })
    const result = orderEditBody(orderFormFromOrder(o), { ...orderFormFromOrder(o), pickupPrecision: 'EXACT' }, orderFormLocks(o))
    expect(result.ok && result.body).toEqual({ pickup: { latitude: 40.1, longitude: 44.5, address: 'Maisv', precision: 'EXACT' } })
  })

  it('an older assigned order (coordinates, no precision) can still have its phone edited — the locked pickup is not sent', () => {
    const o = order({ status: 'ASSIGNED', assignedDriverId: 5, pickup: { latitude: 40.1, longitude: 44.5, address: 'Maisv', precision: null } })
    const result = orderEditBody(orderFormFromOrder(o), { ...orderFormFromOrder(o), customerName: 'Ani' }, orderFormLocks(o))
    expect(result.ok && result.body).toEqual({ customerName: 'Ani' })
  })
})

describe('referring driver (2026-11-17)', () => {
  it('travels with the order and is an edit of its own', () => {
    const o = order()
    const built = buildOrderBody({ ...orderFormFromOrder(o), referrerDriverId: 9 })
    expect(built.ok && built.body.referrerDriverId).toBe(9)
    const result = orderEditBody(orderFormFromOrder(o), { ...orderFormFromOrder(o), referrerDriverId: 9 }, orderFormLocks(o))
    expect(result.ok && result.body).toEqual({ referrerDriverId: 9 })
  })

  it('a closed order cannot change who referred it (the share may already be paid)', () => {
    const o = order({ status: 'COMPLETED' })
    expect(orderEditBody(orderFormFromOrder(o), { ...orderFormFromOrder(o), referrerDriverId: 9 }, orderFormLocks(o))).toEqual({ ok: true, body: null })
  })
})

describe('buildOrderBody', () => {
  it('keeps a description-only destination and the fallback for coordinates alone', () => {
    const form = { ...orderFormFromOrder(order()), destinationAddress: '', destinationCoords: '40.2, 44.6' }
    const result = buildOrderBody(form)
    expect(result.ok && result.body.destination).toEqual({ latitude: 40.2, longitude: 44.6, address: 'Հասցեն նշված չէ' })
  })
})

describe('create and edit share one form', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url))
  const read = (path: string) => readFileSync(`${ROOT}${path}`, 'utf8')
  it.each(['pages/admin/orders/index.vue', 'pages/admin/orders/[id].vue'])('%s renders OrderFormFields', (page) => {
    expect(read(page)).toMatch(/<OrderFormFields\b/)
  })
})
