/**
 * Will a new offer ring and come up on THIS phone when it is locked? — the
 * checks behind the «Ծանուցումների կարգավորում» screen, as one pure
 * function (unit-tested). Each check says whether it passes, whether it is
 * REQUIRED (no alarm at all without it) or recommended, and which settings
 * page fixes it.
 */
import type { AlarmSettings, AlarmStatus } from './offerAlarm'

export type CheckKey = 'notifications' | 'module' | 'fullScreen' | 'channel' | 'volume' | 'dnd' | 'battery' | 'criticalAlerts'

export interface ReadinessCheck {
  key: CheckKey
  ok: boolean
  required: boolean
  /** What fixes it: a settings page, raising the volume, or asking for the permission */
  fix: { kind: 'settings'; which: AlarmSettings } | { kind: 'volume' } | { kind: 'request' } | { kind: 'rebuild' } | null
}

export interface ReadinessInput {
  platform: 'ios' | 'android'
  notificationsGranted: boolean
  /** Android: the native alarm's own status, null when the module is missing from this build */
  alarm: AlarmStatus | null
  /** iOS: whether this build asks for Critical Alerts, and whether the user allowed them */
  criticalAlertsBuild?: boolean
  criticalAlertsAllowed?: boolean | null
}

export function readiness(input: ReadinessInput): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [
    { key: 'notifications', ok: input.notificationsGranted, required: true, fix: input.notificationsGranted ? null : { kind: 'request' } },
  ]
  if (input.platform === 'ios') {
    if (input.criticalAlertsBuild) {
      checks.push({ key: 'criticalAlerts', ok: input.criticalAlertsAllowed === true, required: false, fix: { kind: 'settings', which: 'app' } })
    }
    return checks
  }
  const a = input.alarm
  if (!a) {
    checks.push({ key: 'module', ok: false, required: true, fix: { kind: 'rebuild' } })
    return checks
  }
  checks.push(
    { key: 'channel', ok: a.channelEnabled, required: true, fix: { kind: 'settings', which: 'channel' } },
    { key: 'fullScreen', ok: a.fullScreenAllowed, required: true, fix: { kind: 'settings', which: 'fullScreen' } },
    { key: 'volume', ok: a.alarmVolume > 0 && a.alarmVolume >= Math.ceil(a.alarmVolumeMax * 0.3), required: a.alarmVolume === 0, fix: { kind: 'volume' } },
    { key: 'dnd', ok: a.channelBypassesDnd, required: false, fix: { kind: 'settings', which: 'channel' } },
    { key: 'battery', ok: a.ignoringBatteryOptimizations, required: false, fix: { kind: 'settings', which: 'battery' } },
  )
  return checks
}

/** Something REQUIRED is missing — Home shows the warning */
export function blocksAlarm(checks: ReadinessCheck[]): boolean {
  return checks.some((check) => check.required && !check.ok)
}
