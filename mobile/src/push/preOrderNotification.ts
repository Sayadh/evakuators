/**
 * «Նոր նախապատվեր» while the app is OPEN (2026-11-17). A pre-order push is an
 * ordinary FCM notification: with the app closed the system draws it; with
 * the app open FCM hands it to the app and nothing is shown. So the app draws
 * it itself — same words, sound, the `orders` channel — and a tap opens the
 * list (AppState's notification-response listener → preOrderEvents).
 */
import * as Notifications from 'expo-notifications'
import { isPreOrderPush } from './preOrderEvents'

export async function showPreOrderNotification(preOrderId: number, text: { title?: string | null; body?: string | null }, fallback: { title: string; body: string }): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: `pre-order-${preOrderId}`,
    content: {
      title: text.title || fallback.title,
      body: text.body || fallback.body,
      data: { type: 'pre_order', preOrderId: String(preOrderId) },
      sound: 'default',
    },
    trigger: { channelId: 'orders' },
  })
}

/** The pre-order a tapped notification belongs to (app-drawn, or remote on iOS where the data rides the trigger) */
export function preOrderIdOf(notification: Notifications.Notification): number | null {
  const data = notification.request.content.data as Record<string, unknown> | undefined
  const payload = (notification.request.trigger as { payload?: Record<string, unknown> } | null)?.payload
  return isPreOrderPush(data) ?? isPreOrderPush(payload)
}
