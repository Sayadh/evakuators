import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readFileSync } from 'node:fs'
import { appsFor, cleanTarget, mapsLinks, orderedApps } from '../src/domain/mapsApps'

/** Source without comments — the rules are about code, not about the prose explaining them */
const code = (path: string) =>
  readFileSync(`${__dirname}/../${path}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('external navigation', () => {
  it('every maps app gets latitude first (or named lat/lon), 6 decimals, and a web fallback', () => {
    const point = { latitude: 40.1772, longitude: 44.5126 }
    const g = mapsLinks('google', point, 'android')
    assert.equal(g.app, 'google.navigation:q=40.177200,44.512600&mode=d')
    assert.match(g.web, /destination=40\.177200%2C44\.512600/)
    assert.equal(mapsLinks('google', point, 'ios').app, 'comgooglemaps://?daddr=40.177200,44.512600&directionsmode=driving')
    assert.equal(mapsLinks('yandexNavi', point, 'android').app, 'yandexnavi://build_route_on_map?lat_to=40.177200&lon_to=44.512600')
    assert.match(mapsLinks('yandexMaps', point, 'android').app, /rtext=~40\.177200%2C44\.512600&rtt=auto/)
    assert.match(mapsLinks('yandexMaps', point, 'android').web, /^https:\/\/yandex\.com\/maps\/\?rtext=~40\.177200%2C44\.512600/)
    assert.equal(mapsLinks('waze', point, 'android').app, 'waze://?ll=40.177200,44.512600&navigate=yes')
    assert.equal(mapsLinks('apple', point, 'ios').app, 'maps://?daddr=40.177200,44.512600&dirflg=d')
    // never Yandex's longitude-first ll= / pt=
    for (const app of ['yandexNavi', 'yandexMaps'] as const) assert.doesNotMatch(mapsLinks(app, point, 'android').app + mapsLinks(app, point, 'android').web, /[?&](ll|pt)=/)
  })
  it('cleans the point: strings, swapped pairs, garbage', () => {
    assert.deepEqual(cleanTarget({ latitude: '40.1772000', longitude: '44.5126000' }), { latitude: 40.1772, longitude: 44.5126 })
    assert.deepEqual(cleanTarget({ latitude: 44.5126, longitude: 40.1772 }), { latitude: 40.1772, longitude: 44.5126 })
    assert.equal(cleanTarget({ latitude: null, longitude: 44.5 }), null)
    assert.equal(cleanTarget({ latitude: 0, longitude: 0 }), null)
    assert.equal(cleanTarget({ latitude: 'x', longitude: 44.5 }), null)
    assert.equal(cleanTarget(null), null)
  })
  it('the app list: Apple Maps only on iPhone, the last choice first', () => {
    assert.deepEqual(appsFor('android'), ['google', 'yandexNavi', 'yandexMaps', 'waze'])
    assert.equal(appsFor('ios')[0], 'apple')
    assert.deepEqual(orderedApps('android', 'waze'), ['waze', 'google', 'yandexNavi', 'yandexMaps'])
    assert.deepEqual(orderedApps('android', 'apple'), appsFor('android'))
  })
  it('the order screen opens the chooser, never a hard-coded maps link', () => {
    const source = code('src/screens/ActiveOrderScreen.tsx')
    assert.doesNotMatch(source, /google\.navigation:|maps:\/\//)
    assert.match(source, /openInMaps\(/)
  })
  it('the offer screen never renders customer contact (the API does not send it either)', () => {
    const source = code('src/screens/OfferScreen.tsx')
    assert.doesNotMatch(source, /customer/)
  })
  it('accept success is never shown locally: the button only reflects pending state', () => {
    const source = code('src/screens/OfferScreen.tsx')
    assert.doesNotMatch(source, /accepted|Accepted|setAccepted/)
  })
})
