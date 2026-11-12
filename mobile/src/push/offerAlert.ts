/**
 * One short ring when an offer appears ON SCREEN (product decision, 2026-11):
 * the driver is already looking at the app, so a single sound + vibration is
 * enough. The long, repeating ring is for the LOCKED phone and comes from the
 * offer push itself (backend notify/push.service.ts: bundled `offer_alert.wav`,
 * re-sent every ~10 s until answered); while the app is open that push is
 * silenced (push.ts notification handler).
 *
 * The sound is a local notification with the driver's CHOSEN ring (sounds.ts)
 * — iOS names the bundled file, Android uses that ring's channel (a channel's
 * sound is fixed). No data on it, so the handler lets it play. It is removed
 * as soon as the offer is answered or leaves the screen, which also stops the
 * sound. Limits: the iOS ring/silent switch mutes it (vibration still works).
 *
 * Android (2026-11): the ring plays AT ONCE through the alarm module's player
 * (ALARM stream, no channel to create first, not muted by a phone that turns
 * new channels' sound off). The notification is only the fallback for a
 * build without that module.
 */
import * as Notifications from 'expo-notifications'
import { Platform, Vibration } from 'react-native'
import { ringChannelId, setupChannels } from './channels'
import { getAlertSound, soundFile, soundResource } from './sounds'
import { previewAlarmSound, stopAlarmSoundPreview } from './offerAlarm'

let lastId: string | null = null

/** Bumped by every start/stop: a ring scheduled for an older start is removed at once */
let generation = 0

export function startOfferAlert(title: string): void {
  stopOfferAlert()
  const mine = ++generation
  void (async () => {
    const sound = await getAlertSound()
    if (mine !== generation) return
    if (Platform.OS === 'android' && previewAlarmSound(soundResource(sound))) return
    // A missing channel on Android means no sound
    await setupChannels().catch(() => undefined)
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, sound: soundFile(sound), priority: Notifications.AndroidNotificationPriority.MAX },
      trigger: Platform.OS === 'android' ? { channelId: ringChannelId(sound) } : null,
    }).catch(() => null)
    // Answered while the sound was being looked up: do not leave it ringing
    if (mine !== generation) {
      if (id) void Notifications.dismissNotificationAsync(id).catch(() => undefined)
      return
    }
    lastId = id
  })()
  Vibration.vibrate(Platform.OS === 'android' ? [0, 500, 250, 500] : undefined)
}

/** Removes the in-app ring's banner (the offer was answered, expired or left the screen) */
export function stopOfferAlert(): void {
  generation++
  Vibration.cancel()
  if (Platform.OS === 'android') stopAlarmSoundPreview()
  if (lastId) void Notifications.dismissNotificationAsync(lastId).catch(() => undefined)
  lastId = null
}
