import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import {
  diffProfile,
  isEmptyDiff,
  EDITABLE_PROFILE_FIELDS,
} from '../src/profile-changes/profile-change-diff'

/**
 * The diff is what makes moderating a profile edit possible at all.
 *
 * The dashboard is a full form: it submits every field on every save, touched
 * or not. Queuing that verbatim would hand a moderator thirty lines to read for
 * a corrected phone number, and approving it would rewrite thirty columns to
 * the values they already held — quietly clobbering anything an admin had
 * changed in the meantime, just because a stale form was submitted.
 *
 * So these tests are mostly about what must NOT appear in a diff.
 */

const CURRENT = {
  driverName: 'Աշոտ Աշոտյան',
  companyName: null,
  secondaryPhone: null,
  whatsapp: '+37491000001',
  telegram: null,
  email: null,
  vehicleBrand: 'Isuzu',
  vehicleYear: 2018,
  vehicleType: 'flatbed',
  capacityTons: 3,
  winch: true,
  manipulator: false,
  description: 'Հին նկարագրություն',
  services: ['towing', 'motorcycle-towing'],
  serviceAreas: [{ slug: 'abovyan', name: 'Աբովյան', type: 'city' }],
  citySlug: 'abovyan',
  pricePerKm: 200,
  imageIds: [1, 2, 3],
  latitude: 40.1792,
  longitude: 44.4991,
}

describe('diffProfile keeps only what changed', () => {
  it('returns nothing when the form was submitted untouched', () => {
    // The commonest save on the whole dashboard, and the one that must not
    // reach a moderator.
    expect(isEmptyDiff(diffProfile({ ...CURRENT }, CURRENT))).toBe(true)
  })

  it('returns one key for a one-field edit', () => {
    const diff = diffProfile({ ...CURRENT, driverName: 'Աշոտ Ուղղված' }, CURRENT)

    expect(Object.keys(diff.changes)).toEqual(['driverName'])
    expect(diff.changes.driverName).toBe('Աշոտ Ուղղված')
    expect(diff.before.driverName).toBe('Աշոտ Աշոտյան')
  })

  it('treats an empty string and null as the same value', () => {
    // A clearable contact field renders null as an empty box, so a driver who
    // never touched it submits ''. Reading that as a change would put a phantom
    // line in front of a moderator on literally every save.
    expect(isEmptyDiff(diffProfile({ companyName: '', telegram: '', email: '' }, CURRENT))).toBe(
      true,
    )
  })

  it('does see a value actually being cleared', () => {
    const diff = diffProfile({ whatsapp: '' }, CURRENT)
    expect(diff.changes.whatsapp).toBe('')
    expect(diff.before.whatsapp).toBe('+37491000001')
  })

  it('compares arrays by content and order', () => {
    expect(isEmptyDiff(diffProfile({ services: ['towing', 'motorcycle-towing'] }, CURRENT))).toBe(
      true,
    )
    // A reorder is a real change: `imageIds` IS the gallery order and
    // `serviceAreas` is display order, so a driver moving their main photo
    // meant it.
    expect(isEmptyDiff(diffProfile({ imageIds: [3, 2, 1] }, CURRENT))).toBe(false)
    expect(isEmptyDiff(diffProfile({ imageIds: [1, 2, 3, 4] }, CURRENT))).toBe(false)
  })

  it('compares nested objects inside arrays', () => {
    expect(
      isEmptyDiff(
        diffProfile({ serviceAreas: [{ slug: 'abovyan', name: 'Աբովյան', type: 'city' }] }, CURRENT),
      ),
    ).toBe(true)
    expect(
      isEmptyDiff(
        diffProfile({ serviceAreas: [{ slug: 'hrazdan', name: 'Հրազդան', type: 'city' }] }, CURRENT),
      ),
    ).toBe(false)
  })

  it('compares a submitted number against a stored one by value', () => {
    // Coordinates come back from Prisma as Decimal and capacity as Float; a
    // strict comparison against the number the form sent is always "different",
    // which would queue a change every time the coordinate dialog was opened
    // and saved untouched.
    expect(isEmptyDiff(diffProfile({ latitude: 40.1792, longitude: 44.4991 }, CURRENT))).toBe(true)
    expect(isEmptyDiff(diffProfile({ capacityTons: 3 }, CURRENT))).toBe(true)
    expect(isEmptyDiff(diffProfile({ capacityTons: 5 }, CURRENT))).toBe(false)
  })

  it('ignores keys that are not driver-editable', () => {
    // The diff is spread into a Prisma update on approval. A key that is not a
    // column turns every approval into an unknown-argument error; a key that IS
    // a column but admin-only would be a privilege escalation with a
    // moderator's own click behind it.
    const diff = diffProfile(
      {
        slug: 'stolen-slug',
        phone: '+37491000009',
        isActive: false,
        isFeatured: true,
        heavyEquipment: true,
        driverName: 'Աշոտ Ուղղված',
      },
      CURRENT,
    )

    expect(Object.keys(diff.changes)).toEqual(['driverName'])
  })

  it('carries regionSlugs whenever coverage changes, without treating it as a change', () => {
    // It is never stored, so it has no "before" — but the coverage cap needs it
    // to tell one marz from two, and a diff that dropped it would leave the cap
    // guessing at approval time.
    const diff = diffProfile(
      {
        serviceAreas: [{ slug: 'hrazdan', name: 'Հրազդան', type: 'city' }],
        regionSlugs: ['kotayk'],
      },
      CURRENT,
    )

    expect(diff.changes.regionSlugs).toEqual(['kotayk'])
    expect(diff.before.regionSlugs).toBeUndefined()
  })

  it('does not queue an edit whose only content is the carried marz list', () => {
    // A driver re-saving an untouched coverage section would otherwise create a
    // request containing nothing a moderator could look at.
    expect(isEmptyDiff(diffProfile({ regionSlugs: ['kotayk'] }, CURRENT))).toBe(true)
  })

  it('skips undefined, which is how a PATCH says "leave this alone"', () => {
    expect(isEmptyDiff(diffProfile({ driverName: undefined }, CURRENT))).toBe(true)
  })
})

describe('the editable allow-list', () => {
  it('excludes every admin-only and system field', () => {
    // Named individually rather than by a rule, because each one is a separate
    // decision documented elsewhere: slug is the public URL, phone is the login
    // key, heavyEquipment is an admin's own placement decision on
    // /tsanr-tehnika, and isActive/isFeatured are moderation state.
    for (const forbidden of [
      'slug',
      'phone',
      'isActive',
      'isFeatured',
      'heavyEquipment',
      'passwordHash',
      'telegramChatId',
      'works24Hours',
    ]) {
      expect(EDITABLE_PROFILE_FIELDS as readonly string[]).not.toContain(forbidden)
    }
  })

  it('includes the coordinate pair, so the base location is moderated too', () => {
    // Leaving it out would make «where I am parked» the one public claim a
    // driver could still change unreviewed — and therefore the obvious way
    // around the queue.
    expect(EDITABLE_PROFILE_FIELDS as readonly string[]).toContain('latitude')
    expect(EDITABLE_PROFILE_FIELDS as readonly string[]).toContain('longitude')
  })
})
