/**
 * The app's sign-up and profile editor run the WEBSITE's form modules
 * (mobile/metro.config.js § "~/"). These tests pin the app's own glue around
 * them: the watchers (`applyChange`), the step split, the photo set, the
 * history summary, and the dashboard port (profileToForm/buildProfileUpdate).
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { createRegistrationFormState, validateRegistrationForm } from '~/utils/registrationForm'
import { applyChange } from '../src/forms/state'
import { timeMask } from '../src/forms/timeMask'
import { addPhotos, makeMain, MAX_PHOTOS, removePhoto, uploadGallery, type GalleryPhoto } from '../src/media/gallery'
import { errorsOf, firstStepWithErrors, passwordErrors, STEPS } from '../src/register/steps'
import { groupByDay, matchesFilter, monthSummary, nextCursor } from '../src/domain/history'
import { buildProfileUpdate, profileToForm, validateProfileForm } from '../src/profile/profileForm'
import type { HistoryItem } from '../src/api/types'

describe('form watchers (applyChange) — what RegistrationFormFields.vue does with watch()', () => {
  it('choosing the manipulator TYPE ticks «has manipulator» and clears the capacity band', () => {
    const form = applyChange({ ...createRegistrationFormState(), capacity: '2-3.5' }, { vehicleType: 'manipulator' })
    assert.equal(form.manipulator, true)
    assert.equal(form.capacity, '')
  })
  it('a service the new type is not offered is dropped (no invisible answers)', () => {
    const form = applyChange({ ...createRegistrationFormState(), vehicleType: 'flatbed', services: ['car-transport'] }, { vehicleType: 'heavy-duty' })
    assert.ok(!form.services.includes('car-transport'))
  })
  it('picking «24/7» clears the working hours', () => {
    const form = applyChange({ ...createRegistrationFormState(), workingHoursStart: '09:00', workingHoursEnd: '18:00' }, { services: ['available-24-7'] })
    assert.equal(form.workingHoursStart, '')
    assert.equal(form.workingHoursEnd, '')
  })
  it('phones keep the fixed +374 and 8 local digits', () => {
    assert.equal(applyChange(createRegistrationFormState(), { phone: '+374091234567' }).phone, '+37491234567')
  })
  it('times are masked to HH:MM', () => {
    assert.equal(timeMask('930'), '09:30')
    assert.equal(timeMask('2575'), '23:59')
  })
})

describe('sign-up steps', () => {
  it('a blank form stops on the first step, and "Next" only reports that step', () => {
    const errors: Record<string, string> = {}
    validateRegistrationForm(createRegistrationFormState(), errors)
    Object.assign(errors, passwordErrors('', '', { tooShort: 'short', mismatch: 'mismatch' }))
    assert.equal(firstStepWithErrors(errors), 0)
    assert.deepEqual(Object.keys(errorsOf('account', errors)).sort(), ['firstName', 'lastName', 'password', 'passwordRepeat', 'phone'])
  })
  it('every error key the website validator can set belongs to a step', () => {
    const errors: Record<string, string> = {}
    validateRegistrationForm(createRegistrationFormState(), errors)
    const covered = new Set(STEPS.flatMap((step) => Object.keys(errorsOf(step, {}))))
    for (const key of Object.keys(errors)) assert.ok(covered.has(key), key)
  })
})

describe('photos', () => {
  const local = (n: number) => ({ uri: `file:///${n}.jpg`, mimeType: 'image/jpeg', fileName: `${n}.jpg` })
  it('never more than six; the first is main; any can be made main', () => {
    let g: GalleryPhoto[] = addPhotos([], [1, 2, 3, 4, 5, 6, 7].map(local))
    assert.equal(g.length, MAX_PHOTOS)
    g = makeMain(g, g[3].key)
    assert.equal((g[0] as { uri: string }).uri, 'file:///4.jpg')
    g = removePhoto(g, g[0].key)
    assert.equal(g.length, 5)
  })
  it('uploads only what is new, once, and returns ids in gallery order (deduplicated)', async () => {
    const existing: GalleryPhoto = { kind: 'existing', key: 'e9', id: 9, url: 'https://x/9.jpg' }
    let g: GalleryPhoto[] = addPhotos([existing], [local(1), local(2)])
    let calls = 0
    const upload = async () => 100 + ++calls
    const first = await uploadGallery(g, upload)
    assert.deepEqual(first.imageIds, [9, 101, 102])
    g = first.gallery
    const again = await uploadGallery(g, upload)
    assert.equal(calls, 2, 'a retry does not upload again')
    assert.deepEqual(again.imageIds, [9, 101, 102])
  })
})

describe('order history', () => {
  const item = (over: Partial<HistoryItem>): HistoryItem => ({
    id: 1, number: 'A-1', status: 'COMPLETED', pickupAddress: 'x', destinationAddress: null, price: { mode: 'FIXED', amountAmd: 10000 },
    completedAt: '2026-11-05T10:00:00Z', cancelledAt: null, createdAt: '2026-11-05T09:00:00Z', assignedAt: '2026-11-05T09:10:00Z', ...over,
  })
  it('sums this month (Yerevan) — a job at 21:30 UTC on the 31st is already the next month in Yerevan', () => {
    const items = [item({}), item({ id: 2, completedAt: '2026-10-31T21:30:00Z' }), item({ id: 3, status: 'CANCELLED', completedAt: null })]
    assert.deepEqual(monthSummary(items, new Date('2026-11-11T12:00:00Z')), { completed: 2, earnedAmd: 20000 })
  })
  it('filters and groups by day; pages by the server cursor', () => {
    const items = [item({}), item({ id: 2, status: 'CANCELLED', completedAt: null, cancelledAt: '2026-11-04T10:00:00Z', assignedAt: '2026-11-04T09:00:00Z' })]
    assert.equal(items.filter((i) => matchesFilter(i, 'cancelled')).length, 1)
    assert.deepEqual(groupByDay(items).map((g) => g.dayKey), ['2026-11-05', '2026-11-04'])
    assert.equal(nextCursor(items), '2026-11-04T09:00:00Z')
  })
})

describe('profile editor (port of dashboard.vue)', () => {
  const truck = {
    id: 7, slug: 'aram', driverName: 'Արամ Պետրոսյան', phone: '+37491000001', works24Hours: false, images: [], updatedAt: '', isPartner: false,
    description: 'Աշխատում եմ Կոտայքում արդեն տաս տարի։', servesAllArmenia: false, services: ['car-transport'],
    vehicle: { brand: 'Isuzu', model: 'NPR', year: 2015, type: 'flatbed', capacityTons: 3, manipulator: false, wheelSkates: true, doubleDeck: false, towHitch: false, winch: true, showPlateNumber: false },
    serviceAreas: [{ slug: 'abovyan', name: 'Աբովյան', type: 'city' }],
    location: { name: 'Աբովյան', citySlug: 'abovyan', regionSlug: 'kotayk', latitude: 40.27, longitude: 44.63 },
    pricing: { cityCallout: 10000 },
    imageDetails: [{ id: 3, url: 'https://x/3.jpg' }],
  } as never
  it('loads a profile into the registration-shaped form and back without inventing changes', () => {
    const form = profileToForm(truck)
    assert.deepEqual(form.regionSlugs, ['kotayk'])
    assert.equal(form.capacity, '2-3.5')
    const errors: Record<string, string> = {}
    assert.ok(validateProfileForm(form, errors, 'hy'), JSON.stringify(errors))
    const payload = buildProfileUpdate(form, [3])
    assert.equal(payload.vehicleBrand, 'Isuzu')
    assert.equal(payload.citySlug, 'abovyan')
    assert.equal(payload.regionSlug, 'kotayk')
    assert.equal(payload.whatsapp, '', "'' clears, as on the website")
    assert.deepEqual(payload.imageIds, [3])
    assert.deepEqual(payload.serviceAreas, [{ slug: 'abovyan', name: 'Աբովյան', type: 'city' }])
  })
})

describe('shared website modules', () => {
  // Walks every `~/…` import the app makes, transitively, and fails on a
  // website file that is not plain TypeScript (Vue, Nuxt auto-imports,
  // composables) — the only kind metro.config.js may bring into the app.
  it('the app only imports PURE website modules', () => {
    const app = join(__dirname, '..')
    const frontend = resolve(app, '../frontend')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (name === 'node_modules') continue
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx?$/.test(name)) files.push(path)
      }
    }
    walk(join(app, 'src'))
    files.push(join(app, 'App.tsx'))
    const seen = new Set<string>()
    const queue: string[] = []
    const importsOf = (file: string) => [...readFileSync(file, 'utf8').matchAll(/(?:import|export)\s+(type\s+)?[^'";]*?from\s+['"]([^'"]+)['"]/g)].filter((m) => !m[1]).map((m) => m[2])
    const resolveFrom = (file: string, spec: string): string | null => {
      const base = spec.startsWith('~/') ? join(frontend, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(file), spec) : null
      if (!base) return null
      for (const candidate of [`${base}.ts`, `${base}/index.ts`, base]) {
        try {
          if (statSync(candidate).isFile()) return candidate
        } catch {
          // next candidate
        }
      }
      return null
    }
    for (const file of files) for (const spec of importsOf(file)) if (spec.startsWith('~/')) queue.push(resolveFrom(file, spec)!)
    while (queue.length) {
      const file = queue.pop()!
      if (!file || seen.has(file)) continue
      seen.add(file)
      assert.ok(file.startsWith(frontend), file)
      assert.ok(!/\.vue$/.test(file) && !/\/(composables|stores|components|pages|plugins|repositories)\//.test(file), `not a pure module: ${file}`)
      const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      assert.ok(!/\buse(I18n|RuntimeConfig|NuxtApp|State|Route|Router)\(/.test(text), `uses Nuxt/Vue: ${file}`)
      if (file.endsWith('.ts')) for (const spec of importsOf(file)) {
        if (!spec.startsWith('~/') && !spec.startsWith('.')) assert.fail(`${file} imports a package: ${spec}`)
        queue.push(resolveFrom(file, spec)!)
      }
    }
    assert.ok(seen.size > 10, `walked ${seen.size} modules`)
  })
})
