import { pluralForm } from '~/utils/pluralForm'

/**
 * A counted message, in the right form for the language being rendered.
 *
 * `plural('card.towTrucks', 5)` reads `card.towTrucks.many` in Russian,
 * `card.towTrucks.many` in English and `card.towTrucks.one` in Armenian — see
 * `pluralForm` for why Armenian only ever has one, and for why the rule is a
 * function here rather than vue-i18n's own `pluralRules`.
 *
 * The count is passed through as `{count}` so the message decides where the
 * number goes: Russian puts it first, and a language that wanted it elsewhere
 * would not need a code change.
 */
export function usePlural(): (key: string, count: number) => string {
  const { t, locale } = useI18n()
  return (key, count) => t(`${key}.${pluralForm(locale.value, count)}`, { count })
}
