/**
 * Picking a vehicle photo — camera or library — through `expo-image-picker`.
 *
 * Loaded with `require` inside a try, and typed by the small interface below,
 * so the app (and its type check) works before the package is installed: the
 * picker is a NATIVE module, so it needs `npx expo install expo-image-picker`
 * and a new development build (docs/live-dispatch/06-mobile.md). Until then the
 * photo step says so instead of crashing.
 *
 * `quality: 0.8` makes iOS hand back JPEG rather than HEIC — what the server's
 * image pipeline expects (backend/src/images) — and keeps uploads small on a
 * mobile connection. No editing/cropping: the server resizes.
 */
export interface PickedPhoto {
  uri: string
  width: number
  height: number
  mimeType: string
  fileName: string
}

interface PickerAsset { uri: string; width: number; height: number; mimeType?: string | null; fileName?: string | null }
interface PickerResult { canceled: boolean; assets: PickerAsset[] | null }
interface PermissionResult { granted: boolean; canAskAgain: boolean }
interface ImagePickerModule {
  launchCameraAsync(options: Record<string, unknown>): Promise<PickerResult>
  launchImageLibraryAsync(options: Record<string, unknown>): Promise<PickerResult>
  requestCameraPermissionsAsync(): Promise<PermissionResult>
  requestMediaLibraryPermissionsAsync(): Promise<PermissionResult>
}

let cached: ImagePickerModule | null | undefined

function picker(): ImagePickerModule | null {
  if (cached !== undefined) return cached
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-image-picker') as ImagePickerModule
  } catch {
    cached = null
  }
  return cached
}

export function isPickerAvailable(): boolean {
  return picker() !== null
}

export type PickOutcome = { ok: true; photos: PickedPhoto[] } | { ok: false; reason: 'unavailable' | 'denied' | 'canceled' }

function toPhoto(asset: PickerAsset, index: number): PickedPhoto {
  const mimeType = asset.mimeType ?? 'image/jpeg'
  const extension = mimeType.includes('png') ? 'png' : 'jpg'
  return { uri: asset.uri, width: asset.width, height: asset.height, mimeType, fileName: asset.fileName ?? `photo-${Date.now()}-${index}.${extension}` }
}

export async function pickPhotos(source: 'camera' | 'library', limit: number): Promise<PickOutcome> {
  const module = picker()
  if (!module) return { ok: false, reason: 'unavailable' }
  const permission = source === 'camera' ? await module.requestCameraPermissionsAsync() : await module.requestMediaLibraryPermissionsAsync()
  if (!permission.granted) return { ok: false, reason: 'denied' }
  const options = { mediaTypes: ['images'], quality: 0.5, exif: false, allowsMultipleSelection: source === 'library' && limit > 1, selectionLimit: limit, orderedSelection: true }
  const result = source === 'camera' ? await module.launchCameraAsync(options) : await module.launchImageLibraryAsync(options)
  if (result.canceled || !result.assets?.length) return { ok: false, reason: 'canceled' }
  return { ok: true, photos: result.assets.slice(0, limit).map(toPhoto) }
}
