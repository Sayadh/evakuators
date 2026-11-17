/**
 * FCM (and APNs through FCM). Push is a NOTIFICATION, never state: on every
 * push — received in foreground, tapped from background, or the one that
 * cold-started the app — the app re-reads `GET /driver-app/me` and renders
 * that. Events arriving over both push and WebSocket are de-duplicated by the
 * snapshot itself (the same offer id renders once).
 */
import { emitPreOrderArrived, emitPreOrderTapped, isPreOrderPush } from './preOrderEvents'
import { showPreOrderNotification } from './preOrderNotification'
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
import { AppState, Platform } from 'react-native'
import { api } from '../api/client'
import Constants from 'expo-constants'
import { getLanguage } from '../auth/session'
import { DICTIONARIES, translate } from '../i18n'
import { wakeFromPush } from '../location/tracking'
import { setupChannels as setupChannelsNow } from './channels'
import { getAlertSound } from './sounds'
import { ringingOfferId, showAlarm, stopAlarm, type AlarmTexts } from './offerAlarm'
import { dismissOfferNotification, isOfferPushNotification, registerOfferCategory, showOfferNotification } from './offerNotification'

const messaging = getMessaging()

// Background/quit-state handler. An offer arrives DATA-ONLY on Android so the
// app draws it itself; iOS shows the APNs alert itself. State is re-read when
// the app opens.
//
// Android (2026-11): the offer is the ALARM — full screen over the lock
// screen, ringing until answered (offerAlarm.ts, mobile/modules/offer-alert).
// A build without that module falls back to the ordinary notification.
//
// The ack tells the server the offer REACHED the phone, which starts the
// driver's answer window there (backend offers.repository.ts markDelivered)
// and answers with that deadline — the alarm rings until then, never longer.
// iOS: the offer push carries `content-available`, which wakes the app — best
// effort; opening the app acks as well.
//
// `offer_closed` (silent): the offer was withdrawn or timed out — stop ringing.
//
// `wake` (silent, 2026-11-14): the locked phone's heartbeat is going stale —
// send one now (location/tracking.ts wakeFromPush).
setBackgroundMessageHandler(messaging, async (message) => {
  const data = (message.data ?? {}) as Record<string, unknown>
  if (data.type === 'wake') {
    await wakeFromPush()
    return
  }
  const offerId = typeof data.offerId === 'string' ? data.offerId : null
  if (data.type === 'offer_closed' && offerId) {
    if (ringingOfferId() === offerId) await stopAlarm()
    dismissOfferNotification(offerId)
    return
  }
  if (data.type !== 'offer' || !offerId) return
  if (Platform.OS !== 'android') {
    await api.ack(offerId, 'PUSH').catch(() => undefined)
    return
  }
  // Ring FIRST — a slow network must not delay the alarm. The push's own
  // `expiresAt` is still the short delivery window, so the first ring is
  // given a provisional minute; the ack's real deadline then replaces it
  // (an update of the same offer: it does not restart the sound).
  // Posted ONCE (2026-11): it used to be re-posted with the deadline from the
  // ack, which could silence the ring it had just started. It ends with the
  // answer, the `offer_closed` push, the app's snapshot, or its own timeout.
  const texts = await alarmTexts(data)
  const shown = await showAlarm(offerId, texts, new Date(Date.now() + PROVISIONAL_RING_MS)).catch(() => false)
  if (!shown) await showOfferNotification(data).catch(() => undefined)
  const ack = await api.ack(offerId, 'PUSH').catch(() => undefined)
  // Answered or gone already (ack found it no longer pending): stop at once.
  if (shown && ack && ack.expiresAt === null) await stopAlarm()
})

const PROVISIONAL_RING_MS = 60_000

/** The alarm's words: the server's lock-screen text, buttons in the driver's language */
export async function alarmTexts(data: Record<string, unknown>): Promise<AlarmTexts> {
  const dictionary = DICTIONARIES[await getLanguage().catch(() => 'hy' as const)]
  return {
    title: typeof data.title === 'string' ? data.title : translate(dictionary, 'offer.title'),
    body: typeof data.body === 'string' ? data.body : '',
    accept: translate(dictionary, 'offer.accept'),
    reject: translate(dictionary, 'offer.reject'),
    channelName: translate(dictionary, 'alerts.channelName'),
  }
}

// What a notification does while the app is OPEN. The offer push repeats
// every ~10 s until answered; with the app open the offer screen is already
// showing (and rang once), so the push is neither shown nor heard. Everything
// else — the in-app ring, order updates — is shown with sound.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const quiet = AppState.currentState === 'active' && isOfferPushNotification(notification)
    return { shouldPlaySound: !quiet, shouldSetBadge: false, shouldShowBanner: !quiet, shouldShowList: !quiet }
  },
})

export { setupChannels } from './channels'


/**
 * iOS Critical Alerts: asked only by a build made with the entitlement
 * (app.config.ts IOS_CRITICAL_ALERTS — which needs Apple's approval first).
 */
export const IOS_CRITICAL_ALERTS = (Constants.expoConfig?.extra as { iosCriticalAlerts?: boolean } | undefined)?.iosCriticalAlerts === true

export async function requestPushPermission(): Promise<boolean> {
  const status = await requestPermission(messaging, IOS_CRITICAL_ALERTS ? { alert: true, sound: true, badge: true, criticalAlert: true } : undefined)
  return status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL
}

/** The token goes with the driver's ring choice: iOS plays the file the server's push names */
export async function registerPushToken(): Promise<void> {
  // The channels exist before any push needs one — the problem alerts
  // (driver_problems) are drawn by FCM itself, which falls back to a quiet
  // default channel when the named one is missing.
  await setupChannelsNow().catch(() => undefined)
  const token = await getToken(messaging)
  await api.pushToken(token, await getAlertSound())
}

export function subscribePush(handlers: { onAnyMessage: (offerId: string | null) => void }): () => void {
  const pick = (data: Record<string, unknown> | undefined) => (data?.type === 'offer' ? String(data.offerId) : null)
  // iOS needs the category registered before an offer alert arrives
  void registerOfferCategory().catch(() => undefined)
  // Pre-orders (2026-11-17): arrived → re-read the list; tapped → open it
  const preOrder = (data: Record<string, unknown> | undefined, tap: boolean): boolean => {
    const id = isPreOrderPush(data)
    if (id === null) return false
    if (tap) emitPreOrderTapped(id)
    else emitPreOrderArrived(id)
    return true
  }
  const unsubscribers = [
    onMessage(messaging, async (message) => {
      if (!preOrder(message.data, false)) return handlers.onAnyMessage(pick(message.data))
      // The app is open: FCM shows nothing, so draw it (with sound) ourselves
      const id = isPreOrderPush(message.data)
      if (id === null) return
      const dictionary = DICTIONARIES[await getLanguage().catch(() => 'hy' as const)]
      await showPreOrderNotification(id, { title: message.notification?.title, body: message.notification?.body }, {
        title: translate(dictionary, 'preOrders.pushTitle'),
        body: translate(dictionary, 'preOrders.pushBody'),
      }).catch(() => undefined)
    }),
    onNotificationOpenedApp(messaging, (message) => {
      if (!preOrder(message.data, true)) handlers.onAnyMessage(pick(message.data))
    }),
    onTokenRefresh(messaging, (token) => void getAlertSound().then((sound) => api.pushToken(token, sound)).catch(() => undefined)),
  ]
  void getInitialNotification(messaging).then((message) => {
    if (message && !preOrder(message.data, true)) handlers.onAnyMessage(pick(message.data))
  })
  return () => unsubscribers.forEach((u) => u())
}
