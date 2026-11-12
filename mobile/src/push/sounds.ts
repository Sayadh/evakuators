/**
 * The new-order ring the driver chose («Զանգի ձայն», 2026-11).
 *
 * Every sound is a file bundled in the app (mobile/assets/sounds, listed in
 * app.config.ts → expo-notifications `sounds`; the extra ones are made by
 * scripts/generate-alert-sounds.py). Who plays it:
 *  - iOS: APNs, with the file named in the offer push → the SERVER must know
 *    the choice: it is sent with the push token (POST me/push-token `sound`)
 *    and the server only accepts ids from its own list (backend
 *    notify/push.service.ts ALERT_SOUNDS — keep the two lists in step);
 *  - Android: the app itself (the native alarm, or the app-drawn
 *    notification) — a channel's sound is fixed, so each sound has its own
 *    channel (channels.ts, modules/offer-alert).
 *
 * The choice is kept on the phone (secure store, readable while locked) and
 * re-sent to the server whenever the push token is registered.
 */
import * as SecureStore from 'expo-secure-store'

export const ALERT_SOUND_IDS = ['classic', 'urgent', 'orchestra', 'siren', 'melody', 'magic', 'reward', 'riff', 'piano', 'marimba', 'sunrise', 'vibes', 'kalimba', 'guitar', 'harp', 'flute', 'chime', 'bells', 'doorbell', 'calm', 'digital'] as const
export type AlertSoundId = (typeof ALERT_SOUND_IDS)[number]
export const DEFAULT_ALERT_SOUND: AlertSoundId = 'classic'

const KEY = 'evk.alertSound'

export function isAlertSound(value: unknown): value is AlertSoundId {
  return typeof value === 'string' && (ALERT_SOUND_IDS as readonly string[]).includes(value)
}

/** The bundled file — `offer_alert.wav` for the original ring, `offer_<id>.wav` for the others */
export function soundFile(id: AlertSoundId): string {
  return id === 'classic' ? 'offer_alert.wav' : `offer_${id}.wav`
}

/** The Android raw resource name (the file without its extension) */
export function soundResource(id: AlertSoundId): string {
  return soundFile(id).replace(/\.wav$/, '')
}

let cached: AlertSoundId | null = null

export async function getAlertSound(): Promise<AlertSoundId> {
  if (cached) return cached
  const saved = await SecureStore.getItemAsync(KEY).catch(() => null)
  cached = isAlertSound(saved) ? saved : DEFAULT_ALERT_SOUND
  return cached
}

const listeners = new Set<(id: AlertSoundId) => void>()

export async function saveAlertSound(id: AlertSoundId): Promise<void> {
  cached = id
  await SecureStore.setItemAsync(KEY, id, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK })
  listeners.forEach((listener) => listener(id))
}

/** Screens showing the current ring stay in step when it changes elsewhere */
export function onAlertSoundChange(listener: (id: AlertSoundId) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
