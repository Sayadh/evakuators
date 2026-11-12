/**
 * The offer notification with «Ընդունել» / «Մերժել» buttons (2026-11).
 *
 * Android: the offer push is DATA-ONLY (backend notify/fcm.ts,
 * `actionCategory`), because FCM-drawn notifications cannot carry buttons —
 * the app draws it here, from the background message handler. An online
 * driver's app runs the location foreground service, so it is alive to do so.
 * iOS: APNs shows the alert itself with `aps.category = 'offer'`; the buttons
 * come from the category registered below.
 *
 * A button press opens the app, which sends the answer with the normal
 * idempotent accept/reject (AppState, notification responses) — the server
 * decides, exactly as for a tap on the offer screen. A press after the
 * deadline gets "offer expired", never a silent success.
 *
 * Text: where from → where to and the distance, written by the server. Never
 * the customer's phone or name (the server does not send them).
 */
import * as Notifications from 'expo-notifications'
import { getLanguage } from '../auth/session'
import { DICTIONARIES, translate } from '../i18n'
import { ringChannelId, setupChannels } from './channels'
import { getAlertSound, soundFile } from './sounds'

export const OFFER_CATEGORY = 'offer'
export const ACCEPT_ACTION = 'ACCEPT'
export const REJECT_ACTION = 'REJECT'

export const offerNotificationId = (offerId: string): string => `offer-${offerId}`

/** Buttons in the driver's app language; registering again just updates them */
export async function registerOfferCategory(): Promise<void> {
  const dictionary = DICTIONARIES[await getLanguage().catch(() => 'hy' as const)]
  await Notifications.setNotificationCategoryAsync(OFFER_CATEGORY, [
    { identifier: ACCEPT_ACTION, buttonTitle: translate(dictionary, 'offer.accept'), options: { opensAppToForeground: true } },
    { identifier: REJECT_ACTION, buttonTitle: translate(dictionary, 'offer.reject'), options: { opensAppToForeground: true, isDestructive: true } },
  ])
}

export async function showOfferNotification(data: Record<string, unknown>): Promise<void> {
  const offerId = typeof data.offerId === 'string' ? data.offerId : null
  if (!offerId) return
  await setupChannels().catch(() => undefined)
  await registerOfferCategory().catch(() => undefined)
  const sound = await getAlertSound()
  await Notifications.scheduleNotificationAsync({
    identifier: offerNotificationId(offerId),
    content: {
      title: typeof data.title === 'string' ? data.title : 'Նոր պատվեր',
      body: typeof data.body === 'string' ? data.body : '',
      data: { type: 'offer', offerId },
      categoryIdentifier: OFFER_CATEGORY,
      sound: soundFile(sound),
      priority: Notifications.AndroidNotificationPriority.MAX,
    },
    // Re-drawn with the same identifier on every repeat push: one notification that rings again
    trigger: { channelId: ringChannelId(sound) },
  })
}

export function offerIdOf(notification: Notifications.Notification): string | null {
  const data = notification.request.content.data as Record<string, unknown> | undefined
  // iOS remote (APNs) notifications carry the FCM data in the trigger payload
  const payload = (notification.request.trigger as { payload?: Record<string, unknown> } | null)?.payload
  const value = data?.offerId ?? payload?.offerId
  return typeof value === 'string' ? value : null
}

/**
 * Removes the offer's notification — the app-drawn one (Android) and the
 * APNs one (iOS) — which also silences its ring. Called when the offer is on
 * screen: the driver is looking at it.
 */
export function dismissOfferNotification(offerId: string): void {
  void Notifications.dismissNotificationAsync(offerNotificationId(offerId)).catch(() => undefined)
  void Notifications.getPresentedNotificationsAsync()
    .then((presented) => Promise.all(presented.filter((n) => offerIdOf(n) === offerId).map((n) => Notifications.dismissNotificationAsync(n.request.identifier))))
    .catch(() => undefined)
}

/** True for the offer push itself (remote, or drawn from it), not the in-app ring */
export function isOfferPushNotification(notification: Notifications.Notification): boolean {
  return offerIdOf(notification) !== null
}
