/**
 * The app's own problem alert (2026-11-16): «Ինտերնետ չկա». The server
 * tells a driver about a lost connection or GPS itself (push
 * `driver_problem`), but with no internet its push cannot arrive — so the
 * location task, which notices every failed send, raises this one locally.
 */
import * as Notifications from 'expo-notifications'
import { getLanguage } from '../auth/session'
import { DICTIONARIES, translate } from '../i18n'
import { PROBLEM_CHANNEL, setupChannels } from './channels'

const NO_INTERNET_ID = 'problem-no-internet'

export async function showNoInternetNotification(): Promise<void> {
  const dictionary = DICTIONARIES[await getLanguage().catch(() => 'hy' as const)]
  await setupChannels().catch(() => undefined)
  await Notifications.scheduleNotificationAsync({
    identifier: NO_INTERNET_ID,
    content: {
      title: translate(dictionary, 'problems.noInternetTitle'),
      body: translate(dictionary, 'problems.noInternetBody'),
      data: { type: 'driver_problem', reason: 'NO_INTERNET' },
      priority: Notifications.AndroidNotificationPriority.MAX,
    },
    trigger: { channelId: PROBLEM_CHANNEL },
  })
}

export async function dismissNoInternetNotification(): Promise<void> {
  await Notifications.dismissNotificationAsync(NO_INTERNET_ID).catch(() => undefined)
}
