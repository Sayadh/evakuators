/**
 * The selectable new-order rings (2026-11): the app, the server and the
 * build must agree on every id and file — a ring the server names but the
 * app does not bundle would play the default iOS sound instead.
 * Text-level checks (sounds.ts needs native modules to import).
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { hy } from '../src/i18n/hy'
import { ru } from '../src/i18n/ru'

const root = join(__dirname, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const idsIn = (source: string, name: string) => JSON.parse(new RegExp(`${name} = (\\[[^\\]]*\\])`).exec(source)![1].replace(/'/g, '"')) as string[]
const fileOf = (id: string) => (id === 'classic' ? 'offer_alert.wav' : `offer_${id}.wav`)

describe('alert sounds', () => {
  const app = idsIn(read('src/push/sounds.ts'), 'ALERT_SOUND_IDS')
  it('the server accepts exactly the rings the app offers', () => {
    assert.deepEqual(idsIn(read('../backend/src/live-dispatch/notify/push.service.ts'), 'ALERT_SOUNDS'), app)
  })
  it('every ring is a bundled 16-bit mono WAV of at most 30 s (iOS limit), listed for the build', () => {
    const config = read('app.config.ts')
    for (const id of app) {
      const path = join(root, 'assets/sounds', fileOf(id))
      assert.ok(existsSync(path), path)
      const wav = readFileSync(path)
      assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
      const channels = wav.readUInt16LE(22)
      const rate = wav.readUInt32LE(24)
      const bits = wav.readUInt16LE(34)
      const seconds = (wav.length - 44) / (rate * channels * (bits / 8))
      assert.ok(seconds <= 30, `${id}: ${seconds}s`)
      assert.match(config, new RegExp(`'${id === 'classic' ? 'alert' : id}'`), `${id} in expo-notifications sounds`)
    }
  })
  it('every ring has a name and a hint in both languages', () => {
    for (const id of app) {
      for (const dictionary of [hy, ru]) {
        assert.ok((dictionary.sound.names as Record<string, string>)[id], id)
        assert.ok((dictionary.sound.hints as Record<string, string>)[id], id)
      }
    }
  })
  it('Android resource names are valid (lowercase, digits, underscore)', () => {
    for (const id of app) assert.match(fileOf(id).replace('.wav', ''), /^[a-z][a-z0-9_]*$/)
  })
})
