import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { ARMENIA_BOUNDS, parseCoordinates } from '../src/domain/coordinates'

describe('coordinates', () => {
  it('reads what Google Maps copies, in a few common spellings', () => {
    assert.deepEqual(parseCoordinates('40.1772, 44.5126'), { latitude: 40.1772, longitude: 44.5126 })
    assert.deepEqual(parseCoordinates(' 40.1772 44.5126 '), { latitude: 40.1772, longitude: 44.5126 })
    assert.deepEqual(parseCoordinates('40.17721234567;44.5126'), { latitude: 40.177212, longitude: 44.5126 })
  })
  it('refuses anything that is not a point in Armenia', () => {
    for (const bad of ['', 'Komitas 5', '44.5126, 40.1772', '48.8566, 2.3522', '40.1772']) assert.equal(parseCoordinates(bad), null, bad)
  })
  it('uses the same bounding box as the server (manual sync point, read as text)', () => {
    const server = readFileSync(`${__dirname}/../../backend/src/common/armenia-bounds.ts`, 'utf8')
    const num = (name: string) => Number(new RegExp(`${name}:\\s*([\\d.]+)`).exec(server)![1])
    const padding = Number(/ARMENIA_BOUNDS_PADDING_DEGREES = ([\d.]+)/.exec(server)![1])
    assert.equal(ARMENIA_BOUNDS.minLatitude, num('minLatitude') - padding)
    assert.equal(ARMENIA_BOUNDS.maxLatitude, num('maxLatitude') + padding)
    assert.equal(ARMENIA_BOUNDS.minLongitude, num('minLongitude') - padding)
    assert.equal(ARMENIA_BOUNDS.maxLongitude, num('maxLongitude') + padding)
  })
})
