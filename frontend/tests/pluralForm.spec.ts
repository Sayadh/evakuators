import { describe, expect, it } from 'vitest'
import { pluralForm } from '~/utils/pluralForm'

/**
 * Russian's three plural forms, and why the exceptions matter.
 *
 * These are not edge cases dressed up as tests: a marz page says «7 городов»
 * and a city page says «1 эвакуатор», and the teens are common enough that a
 * two-form rule is visibly wrong within a screen of the listing.
 */
describe('pluralForm — Russian', () => {
  it('uses the singular for 1, 21, 101', () => {
    for (const n of [1, 21, 31, 101, 1001]) expect(pluralForm('ru', n)).toBe('one')
  })

  it('uses the "few" form for 2-4 and their tens', () => {
    for (const n of [2, 3, 4, 22, 33, 44, 104]) expect(pluralForm('ru', n)).toBe('few')
  })

  it('uses the "many" form for 5-20, 0 and the rest', () => {
    for (const n of [0, 5, 6, 9, 10, 20, 25, 100]) expect(pluralForm('ru', n)).toBe('many')
  })

  it('treats the teens as "many", which is the exception that catches people', () => {
    // 11 is «много» while 21 is «один»; 112 is «много» while 122 is «два».
    for (const n of [11, 12, 13, 14, 111, 112, 113, 114]) expect(pluralForm('ru', n)).toBe('many')
  })
})

describe('pluralForm — English and Armenian', () => {
  it('gives English one form for 1 and another for everything else', () => {
    expect(pluralForm('en', 1)).toBe('one')
    for (const n of [0, 2, 5, 11, 21]) expect(pluralForm('en', n)).toBe('many')
  })

  it('gives Armenian a single form, because a numeral takes the singular', () => {
    // «5 քաղաք», not «5 քաղաքներ» — this is the grammar, not a shortcut.
    for (const n of [0, 1, 2, 5, 11, 21, 100]) expect(pluralForm('hy', n)).toBe('one')
  })

  it('falls back to the single form for a language it does not know', () => {
    // A missing form would be rendered by vue-i18n as its own key path.
    expect(pluralForm('fr', 7)).toBe('one')
  })
})
