/** The three shapes a counted noun takes. English and Armenian use a subset. */
export type PluralForm = 'one' | 'few' | 'many'

/**
 * Which plural form a count takes, per language.
 *
 * ## Why this is hand-written instead of vue-i18n's `pluralRules`
 *
 * Because vue-i18n's version has to live in an `i18n.config.ts`, and that file
 * is transformed at request time by an esbuild that `@nuxtjs/i18n` bundles
 * inside itself — a second copy, 0.25, next to the 0.27 that Vite 7 brings.
 * When the dev server restarts, the shared esbuild service is stopped and the
 * module's own reference to it goes stale; the next transform of that one file
 * fails with "The service is no longer running" and the whole site is replaced
 * by an error overlay. A cold start works, which is what makes it so annoying:
 * it appears after an edit, not on boot.
 *
 * The rule itself is four lines. Trading a plain function for a build-time
 * dependency that breaks on every config change was the wrong side of that
 * bargain, so the function is here and the config file is gone.
 *
 * ## The rules
 *
 * **Russian** takes three forms, and the exceptions are real rather than
 * decorative: 21 is «один» while 11 is «много», and 122 is «два» while 112 is
 * «много». Getting this wrong prints «2 город» and «5 город» on the listing
 * pages a Russian ad lands on.
 *
 * **English** takes two — one and everything else, zero included.
 *
 * **Armenian** takes one. A numeral is followed by the singular, always:
 * «5 քաղաք», not «5 քաղաքներ». So every count in Armenian is `one`, and that
 * is not a shortcut.
 */
export function pluralForm(locale: string, count: number): PluralForm {
  if (locale === 'ru') {
    const mod10 = count % 10
    const mod100 = count % 100

    if (mod10 === 1 && mod100 !== 11) return 'one'
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few'
    return 'many'
  }

  if (locale === 'en') return count === 1 ? 'one' : 'many'

  // Armenian, and anything unknown: one form. A wrong-but-singular noun beats
  // a missing key, which is what a form this locale has no entry for would be.
  return 'one'
}
