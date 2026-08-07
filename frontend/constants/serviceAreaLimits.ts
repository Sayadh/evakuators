import { LocationType } from '~/types/enums'
import { resolveAreaType, YEREVAN_REGION_SLUG } from '~/utils/geography'

/**
 * How many places a driver may claim to serve.
 *
 * ## The rule, in one sentence
 *
 * Yerevan is coverage of a *city*, not of a place — so its districts never
 * count. Everything else (a marz city, or a road corridor like «Գառնի–Գեղարդ»)
 * counts one each, and the budget for those is **2 when Yerevan is one of the
 * chosen regions, 5 when it is not**.
 *
 * That single sentence produces all four cases the product asked for:
 *
 * | Chosen regions | Districts | Cities + corridors |
 * | --- | --- | --- |
 * | Yerevan only | all 12, unlimited | — (none available) |
 * | Yerevan + one marz | all 12, unlimited | 2 |
 * | one marz | — | 3 |
 * | two marzes | — | 5 **in total**, not 5 each |
 *
 * The two-marz row is why the budget is counted across the whole selection
 * rather than per region: a driver picking Lori + Armavir gets five places to
 * spread between them however they like.
 *
 * A second marz raises the budget from 3 to 5 rather than doubling it. Covering
 * two marzes genuinely takes more places than covering one, but not twice as
 * many — the extra two are for the border between them, not for a second full
 * territory.
 *
 * ## Why a corridor costs the same as a city
 *
 * «Գառնի–Գեղարդ» is one answer to "where do you work", exactly like «Աշտարակ»
 * is. It is deliberately NOT cheaper: the whole point of the cap is that a
 * listing which claims everywhere is worth nothing to the person searching, and
 * a corridor is as strong a claim as a town.
 *
 * ## MANUAL SYNC POINT
 *
 * `backend/src/tow-trucks/service-area-limits.ts` is this file's twin and must
 * change with it. There is no shared code between the two projects (see
 * CLAUDE.md) and nothing catches a drift at compile time — the frontend copy
 * decides what a driver is *offered*, the backend copy decides what is
 * *accepted*, and only the second one is a real boundary.
 */

/** Budget when exactly one marz is chosen and Yerevan is not among them */
export const MAX_AREAS_ONE_REGION = 3

/** Budget when two marzes are chosen and Yerevan is not among them — shared between both */
export const MAX_AREAS_TWO_REGIONS = 5

/**
 * Budget when Yerevan IS among the regions.
 *
 * Lower on purpose rather than as a penalty: a driver already covering all of
 * Yerevan is committing most of their day to it, so a wide second marz on top
 * would be a claim they cannot serve.
 */
export const MAX_AREAS_WITH_YEREVAN = 2

/** A driver may cover at most this many marzes — e.g. Yerevan + Kotayk, or Lori + Armavir */
export const MAX_REGIONS = 2

/**
 * Yerevan's districts are exempt, so only these types are charged against the
 * budget. Kept as a predicate rather than an inline `!== District` so the
 * frontend and backend copies read identically.
 */
export function countsTowardsLimit(type: LocationType | string): boolean {
  return type !== LocationType.District
}

export function isYerevanSelected(regionSlugs: readonly string[]): boolean {
  return regionSlugs.includes(YEREVAN_REGION_SLUG)
}

/**
 * The budget for the currently chosen regions.
 *
 * Yerevan short-circuits everything: a driver covering all of Yerevan plus a
 * marz gets 2 there regardless of how the rest is counted, because Yerevan
 * itself is already most of a working day.
 *
 * With no region chosen there is nothing to select yet, so the one-region
 * budget is returned as the honest starting value — the counter reads
 * "0 of 3" before the first marz is ticked, not "0 of 5" followed by a drop.
 */
export function maxAreasFor(regionSlugs: readonly string[]): number {
  if (isYerevanSelected(regionSlugs)) return MAX_AREAS_WITH_YEREVAN
  return regionSlugs.length >= 2 ? MAX_AREAS_TWO_REGIONS : MAX_AREAS_ONE_REGION
}

/**
 * How much of the budget a selection uses.
 *
 * Takes resolved types rather than slugs so it cannot disagree with the picker
 * about what a given slug is — the frontend resolves types once, in one place
 * (`resolveAreaType`), and both the counter and the validator read the result.
 */
export function countLimitedAreas(types: readonly (LocationType | string)[]): number {
  return types.filter(countsTowardsLimit).length
}

/**
 * The message a driver sees when they are over budget.
 *
 * Names the number rather than saying "too many", because the driver's next
 * action is to remove a specific tick and they need to know how many.
 */
export function tooManyAreasMessage(max: number): string {
  return `Կարող եք ընտրել առավելագույնը ${max} քաղաք կամ ուղղություն։ Հեռացրեք ավելորդները։`
}

/**
 * One validator for both forms, returning `''` when the selection is fine.
 *
 * Registration and the dashboard must accept exactly the same selections —
 * anything a driver can choose at sign-up has to stay changeable afterwards, or
 * fixing a mistake means registering again (CLAUDE.md § "Registration and the
 * driver dashboard must offer the same fields"). Two copies of this check would
 * be two chances for that to stop being true.
 *
 * Takes slugs and resolves the types itself, so a caller cannot pass a
 * differently-derived type list and get a different answer than the picker
 * shows.
 */
export function validateServiceAreaSelection(
  regionSlugs: readonly string[],
  areaSlugs: readonly string[],
): string {
  if (areaSlugs.length === 0) return 'Ընտրեք առնվազն մեկ քաղաք կամ շրջան'

  const max = maxAreasFor(regionSlugs)
  const used = countLimitedAreas(areaSlugs.map(resolveAreaType))
  return used > max ? tooManyAreasMessage(max) : ''
}
