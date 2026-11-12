/**
 * Choosing and previewing the new-order ring (sounds.ts says where each
 * platform plays it). Kept apart from sounds.ts so that the pure list stays
 * importable by tests without native modules.
 */
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { setupChannels } from './channels'
import { previewAlarmSound, setAlarmSound, stopAlarmSoundPreview } from './offerAlarm'
import { registerPushToken } from './push'
import { getAlertSound, saveAlertSound, soundFile, soundResource, type AlertSoundId } from './sounds'

/**
 * Saves the choice on the phone, points the Android alarm and channels at
 * it, and tells the server (iOS rings with the file the push names). The
 * server call may fail offline — the choice is re-sent with the push token
 * on the next start, so it is not lost.
 */
export async function chooseAlertSound(id: AlertSoundId): Promise<{ serverUpdated: boolean }> {
  await saveAlertSound(id)
  if (Platform.OS === 'android') {
    setAlarmSound(soundResource(id))
    await setupChannels().catch(() => undefined)
  }
  const serverUpdated = await registerPushToken().then(
    () => true,
    () => false,
  )
  return { serverUpdated }
}

/** Keeps the native alarm on the saved choice (a reinstall or an old build may have lost it) */
export async function syncAlarmSound(): Promise<void> {
  if (Platform.OS === 'android') setAlarmSound(soundResource(await getAlertSound()))
}

let previewId: string | null = null

/**
 * Lets the driver hear a ring. Android: the native player on the alarm
 * stream. iOS: a local notification with that sound — exactly what an offer
 * will sound like (it obeys the ring/silent switch the same way).
 */
export async function previewAlertSound(id: AlertSoundId, title: string): Promise<void> {
  await stopAlertSoundPreview()
  if (Platform.OS === 'android') {
    previewAlarmSound(soundResource(id))
    return
  }
  previewId = await Notifications.scheduleNotificationAsync({
    content: { title, sound: soundFile(id) },
    trigger: null,
  }).catch(() => null)
}

export async function stopAlertSoundPreview(): Promise<void> {
  stopAlarmSoundPreview()
  if (previewId) {
    const id = previewId
    previewId = null
    // Removing a delivered iOS notification also stops its sound
    await Notifications.dismissNotificationAsync(id).catch(() => undefined)
  }
}
