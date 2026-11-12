/**
 * Android notification channels. Its own module so push.ts, offerAlert.ts
 * and offerNotification.ts can all use it without importing each other.
 */
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { ALERT_SOUND_IDS, getAlertSound, soundFile, type AlertSoundId } from './sounds'

/**
 * Offer notifications drawn by the app (offerNotification.ts) ring on this
 * channel with the bundled offer sound. Android fixes a channel's sound when
 * it is first created, so each selectable ring has its OWN channel
 * (sounds.ts); the original keeps the historical 'offer_ring' id. 'offers'
 * keeps the system notification sound for the short in-app ring and urgent order pushes.
 */
export const OFFER_RING_CHANNEL = 'offer_ring'

export function ringChannelId(sound: AlertSoundId): string {
  return sound === 'classic' ? OFFER_RING_CHANNEL : `${OFFER_RING_CHANNEL}_${sound}`
}

/**
 * Creating the channels is several native calls; the in-app ring must not
 * wait for them every time (2026-11: the sound came late). Done once per
 * chosen ring (a new choice creates its channel afresh).
 */
let ready: { sound: AlertSoundId; promise: Promise<void> } | null = null

export async function setupChannels(): Promise<void> {
  if (Platform.OS !== 'android') return
  const sound = await getAlertSound()
  if (ready?.sound !== sound) {
    const promise = createChannels(sound).catch((error: unknown) => {
      ready = null
      throw error
    })
    ready = { sound, promise }
  }
  return ready.promise
}

async function createChannels(sound: AlertSoundId): Promise<void> {
  await Notifications.setNotificationChannelAsync(ringChannelId(sound), {
    name: 'Նոր պատվերի զանգ',
    importance: Notifications.AndroidImportance.MAX,
    sound: soundFile(sound),
    vibrationPattern: [0, 600, 300, 600, 300, 600],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  })
  // Only the chosen ring's channel stays in the system settings
  for (const other of ALERT_SOUND_IDS) {
    if (other !== sound) await Notifications.deleteNotificationChannelAsync(ringChannelId(other)).catch(() => undefined)
  }
  await Notifications.setNotificationChannelAsync('offers', {
    name: 'Նոր պատվերներ',
    importance: Notifications.AndroidImportance.MAX,
    // No `sound` key: the channel keeps the system notification sound. The
    // string 'default' is looked up as a bundled file by expo-notifications
    // and logs "Custom sound 'default' not found" (2026-11).
    vibrationPattern: [0, 400, 200, 400],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  })
  await Notifications.setNotificationChannelAsync('orders', {
    name: 'Պատվերի թարմացումներ',
    importance: Notifications.AndroidImportance.HIGH,
  })
}
