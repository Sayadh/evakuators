import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hy } from '../src/i18n/hy'
import { ru } from '../src/i18n/ru'

function keys(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix]
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
}

describe('localization', () => {
  it('Russian has exactly the Armenian keys (no missing, no extra)', () => {
    assert.deepEqual(keys(ru).sort(), keys(hy).sort())
  })
  it('placeholders match between languages', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join()
    const flatten = (d: unknown) => Object.fromEntries(keys(d).map((k) => [k, k.split('.').reduce<any>((n, p) => n[p], d)]))
    const a = flatten(hy)
    const b = flatten(ru)
    for (const key of Object.keys(a)) assert.equal(ph(b[key]), ph(a[key]), key)
  })
  it('covers every server error code and availability reason the app can receive', async () => {
    const fs = await import('node:fs')
    const backend = fs.readFileSync(`${__dirname}/../../backend/src/live-dispatch/fleet/domain/availability.ts`, 'utf8')
    const reasons = /export type IneligibleReason =([\s\S]*?)\n\n/.exec(backend)![1].match(/'([A-Z_]+)'/g)!.map((s) => s.slice(1, -1))
    for (const reason of reasons) assert.ok(hy.reasons[reason], reason)
  })
})
