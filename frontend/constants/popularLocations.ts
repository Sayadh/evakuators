import type { PlaceKind } from '~/i18n/placeNames'

/**
 * The eight places the front page offers as shortcuts.
 *
 * ## Why these carry a slug and a kind rather than a name and a hint
 *
 * They used to hold Armenian strings — «Գյումրի» and «Շիրակի մարզ». Both are
 * now three strings each, and neither is new information: the name is what
 * `i18n/placeNames.ts` already knows for that slug, and the hint is that name's
 * marz. Copying them here in three languages would be sixteen more strings to
 * keep in step with the ones the rest of the site already uses, and the first
 * one to drift would be wrong on the most-visited page there is.
 *
 * `regionSlug` is absent for Yerevan on purpose: it is not in a marz, and its
 * hint says so — see `popular.capital`.
 */
export interface PopularLocation {
  kind: PlaceKind
  slug: string
  /** The marz this sits in — absent for Yerevan, which is not in one */
  regionSlug?: string
  to: string
}

export const POPULAR_LOCATIONS: PopularLocation[] = [
  { kind: 'region', slug: 'yerevan', to: '/yerevan' },
  { kind: 'city', slug: 'gyumri', regionSlug: 'shirak', to: '/regions/shirak/gyumri' },
  { kind: 'city', slug: 'vanadzor', regionSlug: 'lori', to: '/regions/lori/vanadzor' },
  { kind: 'city', slug: 'sevan', regionSlug: 'gegharkunik', to: '/regions/gegharkunik/sevan' },
  { kind: 'city', slug: 'gavar', regionSlug: 'gegharkunik', to: '/regions/gegharkunik/gavar' },
  { kind: 'city', slug: 'vardenis', regionSlug: 'gegharkunik', to: '/regions/gegharkunik/vardenis' },
  { kind: 'city', slug: 'dilijan', regionSlug: 'tavush', to: '/regions/tavush/dilijan' },
  { kind: 'city', slug: 'kapan', regionSlug: 'syunik', to: '/regions/syunik/kapan' },
]
