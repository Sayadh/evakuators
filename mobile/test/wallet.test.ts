import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bonusFor, feeBands, feeExamples, feeFor, ordersCovered, parseTopupAmount, topupPresets } from '../src/domain/wallet'

const fees = { freeMaxPriceAmd: 5000, baseAmd: 1000, baseMaxPriceAmd: 15000, percent: 7, roundAmd: 100, maxAmd: 6000 }

describe('wallet (app side)', () => {
  it('the same fee rule as the server', () => {
    assert.equal(feeFor(null, fees), 1000, 'no price yet: the provisional base fee')
    assert.equal(feeFor(5000, fees), 0, 'the minimum order is free')
    assert.equal(feeFor(5001, fees), 1000)
    assert.equal(feeFor(15000, fees), 1000)
    assert.equal(feeFor(15001, fees), 1100)
    assert.equal(feeFor(25000, fees), 1800)
    assert.equal(feeFor(200000, fees), 6000, 'capped')
  })
  it('the schedule as readable bands and examples', () => {
    assert.deepEqual(feeBands(fees), [
      { fromAmd: 0, toAmd: 5000, feeAmd: 0 },
      { fromAmd: 5001, toAmd: 15000, feeAmd: 1000 },
    ])
    assert.deepEqual(feeExamples(fees), [
      { priceAmd: 20000, feeAmd: 1400 },
      { priceAmd: 30000, feeAmd: 2100 },
      { priceAmd: 50000, feeAmd: 3500 },
    ])
  })
  it('typed amounts and presets stay inside the bounds', () => {
    const bounds = { minAmd: 1000, maxAmd: 200000 }
    assert.deepEqual(parseTopupAmount('5 000', bounds), { ok: true, amountAmd: 5000 })
    assert.deepEqual(parseTopupAmount('', bounds), { ok: false, reason: 'EMPTY' })
    assert.deepEqual(parseTopupAmount('12.5', bounds), { ok: false, reason: 'NOT_A_NUMBER' })
    assert.deepEqual(parseTopupAmount('500', bounds), { ok: false, reason: 'TOO_SMALL' })
    assert.deepEqual(parseTopupAmount('300000', bounds), { ok: false, reason: 'TOO_LARGE' })
    assert.deepEqual(topupPresets({ minAmd: 3000, maxAmd: 10000 }), [5000, 10000])
  })
  it('how many base-fee orders a balance covers', () => {
    assert.equal(ordersCovered(5500, fees), 5)
    assert.equal(ordersCovered(-200, fees), 0)
  })
  it('top-up bonus: the highest tier reached', () => {
    const tiers = [{ fromAmd: 20000, percent: 5 }, { fromAmd: 50000, percent: 10 }]
    assert.equal(bonusFor(10000, tiers), 0)
    assert.equal(bonusFor(20000, tiers), 1000)
    assert.equal(bonusFor(60000, tiers), 6000)
    assert.equal(bonusFor(60000), 0)
  })
})
