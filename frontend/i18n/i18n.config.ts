/**
 * Russian needs three plural forms and vue-i18n does not know that on its own.
 *
 * `1 город`, `2 города`, `5 городов` — and the exceptions are not decoration:
 * 11 takes the "many" form while 21 takes "one", and 112 takes "many" while
 * 122 takes "few". Without this rule vue-i18n applies the English two-form rule
 * and the site says «2 город» and «5 город» on the pages a Russian ad lands on.
 *
 * Armenian needs one form — a numeral is followed by the singular, always — so
 * its messages carry a single choice and this rule never applies to them.
 */
export default defineI18nConfig(() => ({
  pluralRules: {
    ru: (choice: number, choicesLength: number): number => {
      if (choicesLength < 3) return choice === 1 ? 0 : 1

      const mod10 = choice % 10
      const mod100 = choice % 100

      if (mod10 === 1 && mod100 !== 11) return 0
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1
      return 2
    },
  },
}))
