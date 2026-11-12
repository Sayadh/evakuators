import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseAmd, planOrderScreen } from '../src/domain/orderSteps'

const base = {
  status: 'ASSIGNED' as const,
  allowedActions: ['EN_ROUTE', 'ARRIVED'] as ('EN_ROUTE' | 'ARRIVED' | 'START_TRANSPORT' | 'COMPLETE')[],
  canCancel: true,
  canSetPrice: false,
  pickup: { latitude: 40.18, longitude: 44.51, address: 'Komitas' },
  destination: null,
}

describe('active order screen — one next step', () => {
  it('accepted: «Շարժվում եմ» only (not also «Տեղում եմ»), cancel, no navigation yet', () => {
    const plan = planOrderScreen(base)
    assert.equal(plan.primary, 'EN_ROUTE')
    assert.equal(plan.secondary, 'CANCEL')
    assert.equal(plan.navigateTo, null)
  })

  it('en route: navigation to pickup, «Տեղում եմ», only a problem report', () => {
    const plan = planOrderScreen({ ...base, status: 'EN_ROUTE_TO_PICKUP', allowedActions: ['ARRIVED'], canCancel: false })
    assert.equal(plan.primary, 'ARRIVED')
    assert.deepEqual(plan.navigateTo, { latitude: 40.18, longitude: 44.51 })
    assert.equal(plan.secondary, 'PROBLEM')
  })

  it('no pickup coordinates → no navigation button', () => {
    const plan = planOrderScreen({ ...base, status: 'EN_ROUTE_TO_PICKUP', allowedActions: ['ARRIVED'], canCancel: false, pickup: { latitude: null, longitude: null, address: 'Komitas' } })
    assert.equal(plan.navigateTo, null)
  })

  it('arrived with a negotiated price not yet agreed: price entry blocks transport', () => {
    const plan = planOrderScreen({ ...base, status: 'ARRIVED_AT_PICKUP', allowedActions: [], canCancel: false, canSetPrice: true })
    assert.equal(plan.primary, null)
    assert.equal(plan.priceEntry, true)
    assert.equal(plan.priceBlocksTransport, true)
  })

  it('accepted, negotiated price not yet agreed (2026-11-12): the price is the first step — no «Շարժվում եմ» yet', () => {
    const plan = planOrderScreen({ ...base, status: 'PRICE_CONFIRMATION_PENDING', allowedActions: [], canSetPrice: true })
    assert.equal(plan.primary, null)
    assert.equal(plan.priceEntry, true)
    assert.equal(plan.priceBlocksTransport, true)
    assert.equal(plan.secondary, 'CANCEL', 'he may still ask to cancel')
  })

  it('transporting: navigation to the destination only if there is one, then «Ավարտել»', () => {
    const transporting = { ...base, status: 'TRANSPORTING' as const, allowedActions: ['COMPLETE' as const], canCancel: false }
    assert.equal(planOrderScreen(transporting).navigateTo, null)
    const withDestination = planOrderScreen({ ...transporting, destination: { latitude: 40.2, longitude: 44.5, address: 'Davtashen' } })
    assert.equal(withDestination.primary, 'COMPLETE')
    assert.deepEqual(withDestination.navigateTo, { latitude: 40.2, longitude: 44.5 })
  })

  it('waiting for an operator: nothing to press', () => {
    const plan = planOrderScreen({ ...base, status: 'NEEDS_ATTENTION', allowedActions: [], canCancel: false, canSetPrice: true })
    assert.equal(plan.primary, null)
    assert.equal(plan.secondary, null)
    assert.equal(plan.priceEntry, false)
    assert.equal(plan.waitingForOperator, true)
  })
})

describe('agreed price input', () => {
  it('accepts the ways people type a price', () => {
    assert.equal(parseAmd('15000'), 15000)
    assert.equal(parseAmd('15 000 ֏'), 15000)
    assert.equal(parseAmd('15.000'), 15000)
    assert.equal(parseAmd('0'), 0)
  })
  it('rejects anything that is not a price', () => {
    for (const bad of ['', 'abc', '-5', '15k', '99999999999']) assert.equal(parseAmd(bad), null, bad)
  })
})
