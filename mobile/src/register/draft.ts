/**
 * The sign-up draft, kept on the phone so a long form survives the app being
 * closed, a call coming in, or the OS reclaiming memory.
 *
 * Never the password (it is cleared before saving) and never anything
 * uploaded: the photos are kept as local file URIs, which the picker copied
 * into the app's own cache. A file under the app's documents directory, not
 * SecureStore — the draft is longer than SecureStore's value limit, and holds
 * nothing secret once the password is out.
 */
import { File, Paths } from 'expo-file-system'
import type { GalleryPhoto } from '../media/gallery'
import type { RegistrationFormState } from '../forms/state'

const VERSION = 1

export interface RegistrationDraft {
  version: number
  savedAt: number
  step: number
  form: RegistrationFormState
  gallery: GalleryPhoto[]
}

function file(): File {
  return new File(Paths.document, 'registration-draft.json')
}

/**
 * Whether a picked photo's file is still on the phone. The picker's copies
 * live in the app's cache, and iOS both purges the cache and moves the app's
 * whole folder on every reinstall/update — a draft's photo URI can point at
 * nothing, and uploading it fails before leaving the phone ("no internet",
 * 2026-11-12). Unknown → assume present (the upload will say otherwise).
 */
export function photoFileExists(uri: string): boolean {
  try {
    return new File(uri).exists
  } catch {
    return true
  }
}

/** Local photos whose file is gone are dropped (the driver re-adds them). */
export function withExistingPhotos(gallery: GalleryPhoto[]): { gallery: GalleryPhoto[]; lost: number } {
  const kept = gallery.filter((photo) => photo.kind !== 'local' || photoFileExists(photo.uri))
  return { gallery: kept, lost: gallery.length - kept.length }
}

export async function loadDraft(): Promise<RegistrationDraft | null> {
  try {
    const draft = JSON.parse(await file().text()) as RegistrationDraft
    if (draft.version !== VERSION || !draft.form) return null
    return { ...draft, gallery: withExistingPhotos(draft.gallery ?? []).gallery }
  } catch {
    return null
  }
}

export function saveDraft(draft: Omit<RegistrationDraft, 'version' | 'savedAt'>): void {
  try {
    // Uploaded ids are dropped too: an id is only good until the nightly
    // orphan purge, and a draft can outlive that.
    const gallery = draft.gallery.map((photo) => (photo.kind === 'local' ? { ...photo, uploadedId: undefined } : photo))
    void file()
      .write(JSON.stringify({ ...draft, gallery, version: VERSION, savedAt: Date.now() }))
      .catch(() => undefined)
  } catch {
    // A draft is a convenience; failing to keep one must never block the form.
  }
}

export function clearDraft(): void {
  try {
    file().delete()
  } catch {
    // nothing saved
  }
}
