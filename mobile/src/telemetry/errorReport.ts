/**
 * The driver app's crashes and unhandled errors → the in-house tracker
 * (2026-11-17, POST /api/v1/errors/client; shown on /admin/orders/errors and,
 * when new, sent to the operators on Telegram). Without it a crash on a
 * driver's phone is invisible until he calls.
 *
 * Installed first thing in index.ts. Fire-and-forget: never awaits, never
 * throws, keeps React Native's own handler (the red screen in development, the
 * crash in release) exactly as it was. No personal data is sent: the message,
 * the stack, the app version and the platform; the server scrubs numbers too.
 */
import Constants from 'expo-constants'
import * as Updates from 'expo-updates'
import { Platform } from 'react-native'
import { API_BASE } from '../api/client'
import { MAX_REPORTS_PER_LAUNCH, toMobileReport, type MobileErrorReport } from './errorShape'

let sent = 0

/** «1.0.0-a·3f9c2d1e»: version, platform and — once EAS Update shipped one — which OTA update was running */
function release(): string {
  const update = Updates.updateId ? `·${Updates.updateId.slice(0, 8)}` : ''
  return `${Constants.expoConfig?.version ?? '?'}${Platform.OS === 'android' ? '-a' : '-i'}${update}`
}

export function reportError(error: unknown, extra: { fatal?: boolean; where?: string } = {}): void {
  try {
    if (!API_BASE || sent >= MAX_REPORTS_PER_LAUNCH) return
    const report: MobileErrorReport | null = toMobileReport(error, { fatal: extra.fatal, release: release(), platform: `${Platform.OS} ${String(Platform.Version)}` })
    if (!report) return
    sent++
    void fetch(`${API_BASE}/errors/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(extra.where ? { ...report, where: extra.where } : report),
    }).catch(() => undefined)
  } catch {
    // reporting must never become the error
  }
}

interface ErrorUtilsLike {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void
}

export function installErrorReporting(): void {
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils
  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler()
    errorUtils.setGlobalHandler((error, isFatal) => {
      reportError(error, { fatal: isFatal })
      previous(error, isFatal)
    })
  }
  // Unhandled promise rejections (Hermes)
  const hermes = (globalThis as { HermesInternal?: { enablePromiseRejectionTracker?: (options: unknown) => void } }).HermesInternal
  hermes?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id: number, rejection: unknown) => reportError(rejection, { where: 'unhandled promise' }),
    onHandled: () => undefined,
  })
}
