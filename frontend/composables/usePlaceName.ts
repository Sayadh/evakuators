import { localizedPlaceName, type PlaceKind } from '~/i18n/placeNames'

/**
 * The name to show for a place, in the language being rendered.
 *
 * A composable rather than a bare import so callers do not each reach for
 * `useI18n().locale` and then forget to make it reactive — the returned
 * function reads the locale at call time, so a component that renders a city
 * name re-renders it when the language changes without doing anything.
 *
 * `data/*.ts` stays the Armenian source of truth; the translations live in
 * `i18n/placeNames.ts`. See that file for why they are a separate map and why
 * the 300 settlements are deliberately not in it.
 */
export function usePlaceName(): (kind: PlaceKind, slug: string, armenianName: string) => string {
  const { locale } = useI18n()
  return (kind, slug, armenianName) =>
    localizedPlaceName(kind, slug, armenianName, locale.value)
}
