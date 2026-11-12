/**
 * The «switch to Armenian» prompt shown to a visitor who LANDS on a Russian or
 * English page (components/common/LanguagePrompt.vue).
 *
 * Deliberately not in i18n/locales: the message is Armenian on every page it
 * appears on — that is the point of it — and the locale files are tested to
 * hold no Armenian outside hy.json. Only the "stay" button speaks the page's
 * own language, so a visitor who reads no Armenian can still close it.
 */
export const LANGUAGE_PROMPT = {
  title: 'Կայքը հասանելի է հայերենով',
  /** `{language}` — the language the page is in now, in Armenian */
  text: 'Դուք դիտում եք կայքը {language}։ Ավելի հարմար է հայերենով։',
  switchLabel: 'Անցնել հայերենի',
  /** The page's current language, as it reads inside `text` */
  languageNames: {
    ru: 'ռուսերենով',
    en: 'անգլերենով',
  },
  /** In the page's own language — the one button a non-Armenian reader needs */
  stayLabels: {
    ru: 'Остаться на русском',
    en: 'Stay in English',
  },
} as const

/**
 * Cookie that remembers the answer (switch, stay or close). It lives 24 hours:
 * a visitor is not asked twice in one day, but someone who landed on a Russian
 * page once is offered Armenian again on a later visit. A preference cookie the
 * site itself needs, never sent anywhere — not gated on analytics consent.
 */
export const LANGUAGE_PROMPT_COOKIE = 'evakuators_language_prompt'
export const LANGUAGE_PROMPT_COOKIE_MAX_AGE = 60 * 60 * 24

/**
 * A language picked in the SWITCHER (2026-11-12) is a choice, not a passing
 * answer: remembered for a year under the same cookie, so the prompt never
 * opens for someone who chose Russian or English themselves. Before this, a
 * visitor who switched to Russian and later reloaded (or came back) was asked
 * again — and the big gold «Անցնել հայերենի» button sent them back to
 * Armenian, which read as "the site keeps switching back".
 */
export const LANGUAGE_CHOICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export type PromptedLocale = keyof typeof LANGUAGE_PROMPT.stayLabels

/**
 * Whether to ask. Pure, so it is tested without mounting anything:
 * only on a Russian/English page, never in the admin panel, and not while the
 * 24-hour answer cookie is set.
 */
export function shouldShowLanguagePrompt(input: {
  locale: string
  path: string
  answered: boolean
}): input is { locale: PromptedLocale; path: string; answered: boolean } {
  if (input.answered) return false
  if (input.path === '/admin' || input.path.startsWith('/admin/')) return false
  return input.locale in LANGUAGE_PROMPT.stayLabels
}
