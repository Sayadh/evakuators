/**
 * A vehicle's photos while they are being edited — the website's rules
 * (frontend/pages/register.vue, dashboard.vue), expressed for a phone:
 *
 * - 1 to 6 photos; the FIRST is the main photo (its position is what the server
 *   stores — `imageIds[0]` is main);
 * - a photo already on the profile keeps its id and is never uploaded again;
 * - a new photo is uploaded once — a retry resumes rather than re-uploading
 *   (`uploadedId`), which matters on a mobile connection and with the
 *   10-uploads-a-minute limit on `POST /images`.
 *
 * Pure (unit-tested); the upload itself is injected.
 */
export const MAX_PHOTOS = 6

export type GalleryPhoto =
  | { kind: 'existing'; key: string; id: number; url: string }
  | { kind: 'local'; key: string; uri: string; mimeType: string; fileName: string; uploadedId?: number }

export function previewUri(photo: GalleryPhoto): string {
  return photo.kind === 'existing' ? photo.url : photo.uri
}

export function addPhotos(gallery: GalleryPhoto[], photos: { uri: string; mimeType: string; fileName: string }[]): GalleryPhoto[] {
  const room = Math.max(MAX_PHOTOS - gallery.length, 0)
  return [...gallery, ...photos.slice(0, room).map((p, i) => ({ kind: 'local' as const, key: `${p.uri}#${Date.now()}-${i}`, ...p }))]
}

export function removePhoto(gallery: GalleryPhoto[], key: string): GalleryPhoto[] {
  return gallery.filter((photo) => photo.key !== key)
}

export function makeMain(gallery: GalleryPhoto[], key: string): GalleryPhoto[] {
  const photo = gallery.find((p) => p.key === key)
  return photo ? [photo, ...gallery.filter((p) => p.key !== key)] : gallery
}

/**
 * Uploads what still needs it, in order, and returns the ids in gallery order
 * — deduplicated, as dashboard.vue does — plus the gallery with the ids
 * recorded (so a failure part-way keeps the uploads that succeeded).
 */
export async function uploadGallery(
  gallery: GalleryPhoto[],
  upload: (photo: Extract<GalleryPhoto, { kind: 'local' }>) => Promise<number>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ gallery: GalleryPhoto[]; imageIds: number[] }> {
  const next = [...gallery]
  const pending = next.filter((p) => p.kind === 'local' && p.uploadedId === undefined).length
  let done = 0
  onProgress?.(0, pending)
  for (let i = 0; i < next.length; i++) {
    const photo = next[i]
    if (photo.kind === 'local' && photo.uploadedId === undefined) {
      const id = await upload(photo)
      next[i] = { ...photo, uploadedId: id }
      onProgress?.(++done, pending)
    }
  }
  const ids = next.map((p) => (p.kind === 'existing' ? p.id : p.uploadedId)).filter((id): id is number => id !== undefined)
  return { gallery: next, imageIds: [...new Set(ids)] }
}
