/**
 * The offer alarm, from JS — the incoming-call style alert of a new offer on
 * a locked phone (2026-11). Android: the native module in
 * mobile/modules/offer-alert (full-screen intent over the lock screen, an
 * insistent ring on the ALARM stream, Accept/Reject buttons). iOS has no
 * equivalent an App Store app may use (CallKit is for VoIP calls only): there
 * the offer is a time-sensitive APNs alert with the bundled ring, repeated by
 * the server every ~10 s, and — once Apple approves it — a Critical Alert.
 *
 * Every function is safe where the module is missing (iOS, or a development
 * build made before this module existed): it does nothing and says so.
 */
import { requireOptionalNativeModule, type EventSubscription } from 'expo'
import { Platform } from 'react-native'

export interface AlarmStatus {
  notificationsEnabled: boolean
  /** Android 14+: «Full screen notifications» allowed for the app */
  fullScreenAllowed: boolean
  channelEnabled: boolean
  channelBypassesDnd: boolean
  dndActive: boolean
  alarmVolume: number
  alarmVolumeMax: number
  ignoringBatteryOptimizations: boolean
  sdk: number
}

export type AlarmAction = { offerId: string; action: 'OPEN' | 'ACCEPT' | 'REJECT' }

interface NativeOfferAlert {
  show(offerId: string, title: string, body: string, acceptLabel: string, rejectLabel: string, channelName: string, timeoutMs: number): Promise<void>
  mute(): Promise<void>
  stop(): Promise<void>
  activeOfferId(): string | null
  consumeAction(): AlarmAction | null
  status(channelName: string): Promise<AlarmStatus>
  openSettings(which: AlarmSettings): boolean
  raiseAlarmVolume(): boolean
  test(delayMs: number, title: string, body: string, acceptLabel: string, rejectLabel: string, channelName: string): Promise<void>
  setSound(name: string): boolean
  sound(): string
  preview(name: string): boolean
  stopPreview(): void
  systemInsets(): SystemInsets | null
  addListener(event: 'onAction', listener: (event: AlarmAction) => void): EventSubscription
}

/** The phone's status bar and navigation bar, in dp */
export interface SystemInsets {
  top: number
  bottom: number
  left: number
  right: number
}

/** Android: where the system bars cover the app (edge-to-edge); null without the module or before layout */
export function systemInsets(): SystemInsets | null {
  try {
    return native?.systemInsets() ?? null
  } catch {
    return null
  }
}

export type AlarmSettings = 'fullScreen' | 'channel' | 'notifications' | 'battery' | 'app'

const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeOfferAlert>('EvkOfferAlert') : null

export const isAlarmAvailable = (): boolean => native !== null

/** What the alarm shows and in which language — the JS side owns the words */
export interface AlarmTexts {
  title: string
  body: string
  accept: string
  reject: string
  channelName: string
}

/** Never longer than this, whatever the deadline says — a stuck ring is the worst failure */
const MAX_RING_MS = 3 * 60_000

/**
 * Rings until `deadline` (the server's, after the answer window started) or
 * until stopped. Returns false where the native alarm is not available, so
 * the caller can fall back to an ordinary notification.
 */
export async function showAlarm(offerId: string, texts: AlarmTexts, deadline: Date | null): Promise<boolean> {
  if (!native) return false
  // Already ringing for this offer: never post it again. Re-posting the same
  // insistent notification (even with "only alert once") could cut its sound
  // on some phones (2026-11). The ring ends with the answer, the offer's end
  // (`offer_closed` push, the snapshot) or its own timeout.
  if (ringingOfferId() === offerId) return true
  const left = deadline ? deadline.getTime() - Date.now() : 60_000
  const timeoutMs = Math.min(Math.max(left + 2_000, 5_000), MAX_RING_MS)
  await native.show(offerId, texts.title, texts.body, texts.accept, texts.reject, texts.channelName, timeoutMs)
  return true
}

/** Silence only — the offer stays on screen (over the lock screen if it came up there) */
export async function muteAlarm(): Promise<void> {
  if (native) await native.mute().catch(() => undefined)
}

/** Silence AND take the app back behind the lock screen — the offer is over */
export async function stopAlarm(): Promise<void> {
  if (native) await native.stop().catch(() => undefined)
}

/** The offer the phone is ringing for right now (Android), or null */
export function ringingOfferId(): string | null {
  try {
    return native?.activeOfferId() ?? null
  } catch {
    return null
  }
}

export function consumeAlarmAction(): AlarmAction | null {
  try {
    return native?.consumeAction() ?? null
  } catch {
    return null
  }
}

export function onAlarmAction(listener: () => void): () => void {
  if (!native) return () => undefined
  const subscription = native.addListener('onAction', () => listener())
  return () => subscription.remove()
}

export async function alarmStatus(channelName: string): Promise<AlarmStatus | null> {
  if (!native) return null
  return native.status(channelName).catch(() => null)
}

export function openAlarmSettings(which: AlarmSettings): boolean {
  return native ? native.openSettings(which) : false
}

export function raiseAlarmVolume(): boolean {
  return native ? native.raiseAlarmVolume() : false
}

export async function testAlarm(delayMs: number, texts: AlarmTexts): Promise<boolean> {
  if (!native) return false
  await native.test(delayMs, texts.title, texts.body, texts.accept, texts.reject, texts.channelName)
  return true
}

/** The ring the alarm uses from now on (a res/raw name, e.g. "offer_chime"); false where unavailable */
export function setAlarmSound(resource: string): boolean {
  try {
    return native?.setSound(resource) ?? false
  } catch {
    return false
  }
}

/** Plays a ring for a few seconds on the alarm stream (Android); false where unavailable */
export function previewAlarmSound(resource: string): boolean {
  try {
    return native?.preview(resource) ?? false
  } catch {
    return false
  }
}

export function stopAlarmSoundPreview(): void {
  try {
    native?.stopPreview()
  } catch {
    // module missing: nothing is playing
  }
}
