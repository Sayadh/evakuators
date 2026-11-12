/** Reads the alarm checks now and every time the driver comes back from Settings */
import * as Notifications from 'expo-notifications'
import { useCallback, useEffect, useState } from 'react'
import { AppState, Platform } from 'react-native'
import { useT } from '../i18n'
import { readiness, type ReadinessCheck } from './alertReadiness'
import { alarmStatus } from './offerAlarm'
import { IOS_CRITICAL_ALERTS } from './push'

export function useAlertReadiness(): { checks: ReadinessCheck[] | null; recheck: () => Promise<void> } {
  const t = useT()
  const [checks, setChecks] = useState<ReadinessCheck[] | null>(null)

  const recheck = useCallback(async () => {
    const permission = await Notifications.getPermissionsAsync().catch(() => null)
    const alarm = Platform.OS === 'android' ? await alarmStatus(t('alerts.channelName')) : null
    setChecks(
      readiness({
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        notificationsGranted: permission?.granted === true,
        alarm,
        criticalAlertsBuild: IOS_CRITICAL_ALERTS,
        criticalAlertsAllowed: permission?.ios?.allowsCriticalAlerts ?? null,
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void recheck()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void recheck()
    })
    return () => sub.remove()
  }, [recheck])

  return { checks, recheck }
}
