import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readFileSync } from 'node:fs'

/** Source without comments — the rules are about code, not about the prose explaining them */
const code = (path: string) =>
  readFileSync(`${__dirname}/../${path}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('external navigation', () => {
  it('opens the platform maps app with driving directions, falls back to the web URL', () => {
    const source = code('src/screens/ActiveOrderScreen.tsx')
    assert.match(source, /maps:\/\/\?daddr=\$\{lat\},\$\{lng\}&dirflg=d/)
    assert.match(source, /google\.navigation:q=\$\{lat\},\$\{lng\}&mode=d/)
    assert.match(source, /google\.com\/maps\/dir\/\?api=1&destination=/)
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
