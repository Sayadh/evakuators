import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  LANGUAGE_PROMPT,
  LANGUAGE_PROMPT_COOKIE_MAX_AGE,
  shouldShowLanguagePrompt,
} from '~/constants/languagePrompt'

/**
 * The «switch to Armenian» prompt. The rule is a pure function, so it is
 * tested directly; the wiring that only the component can get wrong is pinned
 * as source text, same approach as dispatchCallCta.spec.ts.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const component = readFileSync(`${ROOT}components/common/LanguagePrompt.vue`, 'utf8')
const layout = readFileSync(`${ROOT}layouts/default.vue`, 'utf8')

describe('shouldShowLanguagePrompt', () => {
  const base = { path: '/regions/kotayk', answered: false }

  it('asks on a Russian or English page', () => {
    expect(shouldShowLanguagePrompt({ ...base, locale: 'ru' })).toBe(true)
    expect(shouldShowLanguagePrompt({ ...base, locale: 'en' })).toBe(true)
  })

  it('never asks on an Armenian page', () => {
    expect(shouldShowLanguagePrompt({ ...base, locale: 'hy' })).toBe(false)
  })

  it('does not ask again while the answer is remembered', () => {
    expect(shouldShowLanguagePrompt({ ...base, locale: 'ru', answered: true })).toBe(false)
  })

  it('never asks in the admin panel', () => {
    expect(shouldShowLanguagePrompt({ locale: 'en', path: '/admin', answered: false })).toBe(false)
    expect(shouldShowLanguagePrompt({ locale: 'en', path: '/admin/payments', answered: false })).toBe(false)
  })
})

describe('the prompt copy', () => {
  it('has a way out in every language it is shown in', () => {
    // Somebody who reads no Armenian must still be able to close it.
    expect(Object.keys(LANGUAGE_PROMPT.stayLabels).sort()).toEqual(['en', 'ru'])
    expect(Object.keys(LANGUAGE_PROMPT.languageNames).sort()).toEqual(['en', 'ru'])
    expect(LANGUAGE_PROMPT.stayLabels.ru).toMatch(/[а-я]/)
    expect(LANGUAGE_PROMPT.stayLabels.en).toMatch(/[a-z]/i)
  })

  it('names the current language inside the sentence', () => {
    expect(LANGUAGE_PROMPT.text).toContain('{language}')
  })
})

describe('LanguagePrompt wiring', () => {
  it('decides on mount only — a visitor who switches language themselves is not asked', () => {
    expect(component).toContain('onMounted(')
    expect(component).not.toMatch(/watch\(\s*locale/)
  })

  it('records closing as an answer, so it does not come back', () => {
    expect(component).toContain("remember('stay')")
  })

  it('remembers the answer for exactly 24 hours', () => {
    expect(LANGUAGE_PROMPT_COOKIE_MAX_AGE).toBe(86_400)
    expect(component).toContain('maxAge: LANGUAGE_PROMPT_COOKIE_MAX_AGE')
  })

  it('a language picked in the switcher is remembered, so the prompt never undoes it', () => {
    const switcher = readFileSync(`${ROOT}components/layout/LanguageSwitcher.vue`, 'utf8')
    expect(switcher).toContain('LANGUAGE_PROMPT_COOKIE')
    expect(switcher).toContain('maxAge: LANGUAGE_CHOICE_COOKIE_MAX_AGE')
    expect(switcher.match(/@click="rememberChoice\(option\.code\)"/g)?.length).toBe(2)
  })

  it('is mounted once, in the default layout', () => {
    expect(layout).toContain('<LanguagePrompt />')
  })
})
