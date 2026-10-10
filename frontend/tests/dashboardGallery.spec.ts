import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The driver's own photo section: the main photo, then the rest.
 *
 * `ImagesRepository.applyGallery` rewrites every `position` from the index of
 * the array it is sent, so **index 0 is the main photo** — the one the listing
 * card and every search result show. This screen used to hold two separate
 * arrays (already uploaded, just picked) and concatenate them at save time,
 * which made that fact true by accident and gave the driver no way to choose
 * which photo it was.
 *
 * Source-read rather than mounted, same reasoning as the other page specs
 * here: the subject is the wiring, and this repo has no runtime for Nuxt
 * components (`docs/testing.md`). What these pin are the two things that fail
 * SILENTLY — a gallery that still saves in the right order but shows the wrong
 * slot as main, and a remove button that can reach slot 0.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const page = readFileSync(`${ROOT}pages/dashboard.vue`, 'utf8')
const register = readFileSync(`${ROOT}pages/register.vue`, 'utf8')

describe('the dashboard gallery', () => {
  it('asks for the main photo on its own, the way registration does', () => {
    // The split is the request: one input for the photo customers see, one for
    // the rest. Registration has had it since the beginning.
    expect(register).toContain('id="main-image"')
    expect(page).toContain('id="main-image"')
    expect(page).toContain('Գլխավոր նկար')
    expect(page).toContain('@change="onMainImageChange"')
    expect(page).toContain('@change="onExtraImagesChange"')
  })

  it('keeps one list, so the order IS the answer', () => {
    // Two arrays concatenated at save time is what made "which photo is main"
    // an accident of how they were joined.
    expect(page).toContain('const gallery = shallowRef<GallerySlot[]>([])')
    expect(page).not.toContain('const existingImages =')
    expect(page).not.toContain('const newImageFiles =')
  })

  it('sends the ids in gallery order, main first', () => {
    // `applyGallery` numbers positions from this array's index. Any sort,
    // filter or re-concatenation between here and the request would move the
    // main photo without anything on screen saying so.
    expect(page).toMatch(
      /payload\.imageIds = \[\s*\.\.\.new Set\(\s*gallery\.value\s*\.map\(/,
    )
  })

  it('cannot remove the main photo', () => {
    // A listing must always keep at least one photo — the backend rejects an
    // empty `imageIds`. The main slot is what guarantees it, which is why it
    // has no × and why the remove index counts within the EXTRAS.
    expect(page).toContain('gallery.value[index + 1]')
    expect(page).toContain('gallery.value.filter((_, i) => i !== index + 1)')
    // The button is rendered in the extras loop only.
    const mainBlock = page.slice(page.indexOf('<h4 class="dashboard-photos__title">Գլխավոր նկար'), page.indexOf('Մնացած նկարները'))
    expect(mainBlock).not.toContain('dashboard-image-remove')
  })

  it('remembers an upload on the slot that owns it', () => {
    // Uploads are one throttled request per photo and the save can still be
    // rejected afterwards, so a retry must resume. Keeping the id ON the slot
    // rather than in a parallel array of indexes is what stops a removal from
    // shifting an id onto a different photo.
    expect(page).toContain('slot.uploadedId === undefined')
    expect(page).toContain('slot.uploadedId = image.id')
    expect(page).not.toContain('uploadedNewImageIds')
  })

  it('frees every preview it created', () => {
    // One `createObjectURL` per picked file, and three places that drop one:
    // replacing the main, removing an extra, and leaving the page.
    const creates = page.match(/URL\.createObjectURL\(/g) ?? []
    const revokes = page.match(/URL\.revokeObjectURL\(/g) ?? []
    expect(creates.length).toBeGreaterThan(0)
    expect(revokes.length).toBeGreaterThanOrEqual(creates.length)
  })
})
