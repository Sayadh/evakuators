/**
 * Tiny i18n: no dependency, typed keys. Armenian is the default; Russian is
 * complete (the `Dictionary` type makes a missing key a compile error).
 * `t('offer.secondsLeft', { s: 12 })` → "Մնաց 12 վ".
 */
import { createContext, useContext, useCallback } from 'react'
import { hy, type Dictionary } from './hy'
import { ru } from './ru'

export type Language = 'hy' | 'ru'
export const DICTIONARIES: Record<Language, Dictionary> = { hy, ru }

export function translate(dictionary: Dictionary, path: string, params?: Record<string, string | number>): string {
  const value = path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], dictionary)
  if (typeof value !== 'string') return path
  return params ? value.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : value
}

export const LanguageContext = createContext<{ language: Language; setLanguage: (l: Language) => void }>({
  language: 'hy',
  setLanguage: () => undefined,
})

/**
 * The translate function for the current language. STABLE between renders
 * (changes only with the language): screens list it in effect/callback
 * dependencies, and a new function every render turned a "load on mount"
 * effect into a request loop (the wallet screen hit the server's rate limit,
 * 429, 2026-11-12).
 */
export function useT() {
  const { language } = useContext(LanguageContext)
  return useCallback((path: string, params?: Record<string, string | number>) => translate(DICTIONARIES[language], path, params), [language])
}

export function useLanguage(): Language {
  return useContext(LanguageContext).language
}
