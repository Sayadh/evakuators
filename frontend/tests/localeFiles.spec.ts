import { describe, expect, it } from 'vitest'
import en from '~/i18n/locales/en.json'
import hy from '~/i18n/locales/hy.json'
import ru from '~/i18n/locales/ru.json'

/**
 * The three locale files describe the same site.
 *
 * ## Why this is a test and not a convention
 *
 * A missing key does not throw. `vue-i18n` renders the key path itself — a
 * Russian visitor sees the literal string `home.benefitFreeText` where a
 * sentence should be, the page still returns 200, and nothing in the build,
 * the types or the lint says a word. On a site whose whole purpose for
 * existing in Russian is to be landed on from an ad, that is a defect that
 * costs money and announces itself to nobody.
 *
 * So the invariant is stated here: same keys, no empty values, no key left
 * holding the Armenian original in a file that is not Armenian.
 */

type Messages = Record<string, unknown>

function flatten(messages: Messages, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix + key
    if (value !== null && typeof value === 'object') {
      for (const [nested, text] of flatten(value as Messages, `${path}.`)) out.set(nested, text)
    } else {
      out.set(path, String(value))
    }
  }
  return out
}

const HY = flatten(hy as Messages)
const RU = flatten(ru as Messages)
const EN = flatten(en as Messages)

/** Anything that is deliberately identical across languages */
const SAME_ON_PURPOSE = new Set([
  // The switcher names each language in its own language, everywhere.
  'lang.hy',
  'lang.ru',
  'lang.en',
])

const ARMENIAN = /[԰-֏]/

describe('locale files', () => {
  it('has keys at all', () => {
    expect(HY.size).toBeGreaterThan(20)
  })

  it('defines exactly the same keys in Russian', () => {
    expect([...RU.keys()].sort()).toEqual([...HY.keys()].sort())
  })

  it('defines exactly the same keys in English', () => {
    expect([...EN.keys()].sort()).toEqual([...HY.keys()].sort())
  })

  it.each([
    ['hy', HY],
    ['ru', RU],
    ['en', EN],
  ])('%s has no empty values', (_code, messages) => {
    const empty = [...messages].filter(([, text]) => text.trim() === '').map(([key]) => key)
    expect(empty).toEqual([])
  })

  it('leaves no Armenian text in the Russian file', () => {
    // The way an untranslated key hides: copied across as a placeholder and
    // never revisited. It renders perfectly, in the wrong language.
    const armenian = [...RU]
      .filter(([key, text]) => !SAME_ON_PURPOSE.has(key) && ARMENIAN.test(text))
      .map(([key]) => key)
    expect(armenian).toEqual([])
  })

  it('leaves no Armenian text in the English file', () => {
    const armenian = [...EN]
      .filter(([key, text]) => !SAME_ON_PURPOSE.has(key) && ARMENIAN.test(text))
      .map(([key]) => key)
    expect(armenian).toEqual([])
  })

  it('gives Russian three plural forms wherever Armenian counts something', () => {
    // Russian needs `1 город / 2 города / 5 городов`, and vue-i18n applies the
    // English two-form rule unless the message actually carries three — see
    // `i18n/i18n.config.ts`. A message with `{count}` and one form renders
    // «5 город» on every listing page.
    const counted = [...HY].filter(([, text]) => text.includes('{count}')).map(([key]) => key)
    expect(counted.length).toBeGreaterThan(0)
    for (const key of counted) {
      expect({ key, forms: (RU.get(key) ?? '').split('|').length }).toEqual({ key, forms: 3 })
    }
  })

  it('keeps every interpolation placeholder in all three', () => {
    // `{count}` dropped in translation is a sentence with a hole in it, and
    // `{cuont}` is the key rendered raw. Neither throws.
    //
    // The SET of names, not the list: a Russian plural message repeats
    // `{count}` once per form («{count} город | {count} города | …»), so
    // counting occurrences would fail on every correctly-pluralised string.
    const placeholders = (text: string) => [
      ...new Set(text.match(/\{[a-zA-Z0-9_]+\}/g) ?? []),
    ].sort()
    for (const [key, armenian] of HY) {
      expect({ key, placeholders: placeholders(RU.get(key) ?? '') }).toEqual({
        key,
        placeholders: placeholders(armenian),
      })
      expect({ key, placeholders: placeholders(EN.get(key) ?? '') }).toEqual({
        key,
        placeholders: placeholders(armenian),
      })
    }
  })
})
