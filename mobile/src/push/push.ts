/**
 * FCM (and APNs through FCM). Push is a NOTIFICATION, never state: on every
 * push — received in foreground, tapped from background, or the one that
 * cold-started the app — the app re-reads `GET /driver-app/me` and renders
 * that. Events arriving over both push and WebSocket are de-duplicated by the
 * snapshot itself (the same offer id renders once).
 */
import {
  AuthorizationStatus,
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { api } from '../api/client'

const messaging = getMessaging()

// Background/quit-state data handler: nothing to do but let the OS show the
// notification; state is re-read when the app opens.
setBackgroundMessageHandler(messaging, async () => undefined)

export async function setupChannels(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('offers', {
    name: 'Նոր պատվերներ',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 400, 200, 400],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  })
  await Notifications.setNotificationChannelAsync('orders', {
    name: 'Պատվերի թարմացումներ',
    importance: Notifications.AndroidImportance.HIGH,
  })
}

export async function requestPushPermission(): Promise<boolean> {
  const status = await requestPermission(messaging)
  return status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL
}

export async function registerPushToken(): Promise<void> {
  const token = await getToken(messaging)
  await api.pushToken(token)
}

export function subscribePush(handlers: { onAnyMessage: (offerId: string | null) => void }): () => void {
  const pick = (data: Record<string, unknown> | undefined) => (data?.type === 'offer' ? String(data.offerId) : null)
  const unsubscribers = [
    onMessage(messaging, async (message) => handlers.onAnyMessage(pick(message.data))),
    onNotificationOpenedApp(messaging, (message) => handlers.onAnyMessage(pick(message.data))),
    onTokenRefresh(messaging, (token) => void api.pushToken(token).catch(() => undefined)),
  ]
  void getInitialNotification(messaging).then((message) => {
    if (message) handlers.onAnyMessage(pick(message.data))
  })
  return () => unsubscribers.forEach((u) => u())
}
