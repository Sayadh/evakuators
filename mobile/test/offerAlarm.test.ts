/**
 * The offer alarm on a locked phone (2026-11): what the readiness screen
 * requires, and that the JS bridge and the native module agree on names.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { blocksAlarm, readiness } from '../src/push/alertReadiness'
import { hy } from '../src/i18n/hy'
import { translate } from '../src/i18n'

const ok = {
  notificationsEnabled: true,
  fullScreenAllowed: true,
  channelEnabled: true,
  channelBypassesDnd: true,
  dndActive: false,
  alarmVolume: 6,
  alarmVolumeMax: 7,
  ignoringBatteryOptimizations: true,
  sdk: 35,
}

describe('alarm readiness', () => {
  it('Android, everything allowed → nothing blocks', () => {
    const checks = readiness({ platform: 'android', notificationsGranted: true, alarm: ok })
    assert.equal(blocksAlarm(checks), false)
    assert.ok(checks.every((c) => c.ok))
  })
  it('Android 14+: «full screen notifications» not allowed blocks — the offer would not come up over the lock screen', () => {
    const checks = readiness({ platform: 'android', notificationsGranted: true, alarm: { ...ok, fullScreenAllowed: false } })
    assert.equal(blocksAlarm(checks), true)
    assert.deepEqual(checks.find((c) => c.key === 'fullScreen')?.fix, { kind: 'settings', which: 'fullScreen' })
  })
  it('alarm volume at zero blocks; merely low only warns', () => {
    assert.equal(blocksAlarm(readiness({ platform: 'android', notificationsGranted: true, alarm: { ...ok, alarmVolume: 0 } })), true)
    const low = readiness({ platform: 'android', notificationsGranted: true, alarm: { ...ok, alarmVolume: 1 } })
    assert.equal(blocksAlarm(low), false)
    assert.equal(low.find((c) => c.key === 'volume')?.ok, false)
  })
  it('DND override and battery optimisation are recommendations, never blockers', () => {
    const checks = readiness({ platform: 'android', notificationsGranted: true, alarm: { ...ok, channelBypassesDnd: false, ignoringBatteryOptimizations: false } })
    assert.equal(blocksAlarm(checks), false)
  })
  it('a build without the native module says so (it needs a new build), and blocks', () => {
    const checks = readiness({ platform: 'android', notificationsGranted: true, alarm: null })
    assert.equal(blocksAlarm(checks), true)
    assert.deepEqual(checks.find((c) => c.key === 'module')?.fix, { kind: 'rebuild' })
  })
  it('iOS: notifications are the requirement; Critical Alerts only when the build asks for them', () => {
    assert.deepEqual(readiness({ platform: 'ios', notificationsGranted: true, alarm: null }).map((c) => c.key), ['notifications'])
    const critical = readiness({ platform: 'ios', notificationsGranted: true, alarm: null, criticalAlertsBuild: true, criticalAlertsAllowed: false })
    assert.equal(blocksAlarm(critical), false)
    assert.equal(critical.find((c) => c.key === 'criticalAlerts')?.ok, false)
  })
  it('every check has its words', () => {
    for (const key of ['notifications', 'module', 'fullScreen', 'channel', 'volume', 'dnd', 'battery', 'criticalAlerts']) {
      for (const part of ['title', 'ok', 'missing', 'action']) {
        const path = `alerts.checks.${key}.${part}`
        assert.notEqual(translate(hy, path), path, path)
      }
    }
  })
})

describe('native bridge', () => {
  const root = join(__dirname, '..')
  const kotlin = (name: string) => readFileSync(join(root, 'modules/offer-alert/android/src/main/java/am/evakuators/offeralert', name), 'utf8')
  it('JS asks for the module by the name the Kotlin module registers', () => {
    const js = readFileSync(join(root, 'src/push/offerAlarm.ts'), 'utf8')
    const name = /requireOptionalNativeModule<\w+>\('(\w+)'\)/.exec(js)![1]
    assert.match(kotlin('OfferAlertModule.kt'), new RegExp(`Name\\("${name}"\\)`))
  })
  it('every function the JS side declares exists natively', () => {
    const js = readFileSync(join(root, 'src/push/offerAlarm.ts'), 'utf8')
    const block = /interface NativeOfferAlert \{([\s\S]*?)\n\}/.exec(js)![1]
    const names = [...block.matchAll(/^\s+(\w+)\(/gm)].map((m) => m[1]).filter((n) => n !== 'addListener')
    const native = kotlin('OfferAlertModule.kt')
    for (const n of names) assert.match(native, new RegExp(`Function\\("${n}"\\)`), n)
  })
  it('the alarm rings on the ALARM stream, insistently, with a full-screen intent', () => {
    const k = kotlin('OfferAlarm.kt')
    assert.match(k, /USAGE_ALARM/)
    assert.match(k, /FLAG_INSISTENT/)
    assert.match(k, /setFullScreenIntent\(/)
    assert.match(k, /setTimeoutAfter\(/)
  })
  it('the package is discoverable by Expo autolinking (file name *Package.kt importing BasePackage)', () => {
    assert.match(kotlin('OfferAlertPackage.kt'), /import expo\.modules\.core\.BasePackage/)
  })
})
