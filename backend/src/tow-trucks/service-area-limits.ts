/**
 * How many places a driver may claim to serve — the enforcing copy.
 *
 * ## The rule
 *
 * Yerevan is coverage of a *city*, so its districts never count. Everything
 * else (a marz city, or a road corridor like «Գառնի–Գեղարդ») costs one, and the
 * budget for those is **2 when Yerevan is among the chosen regions, 5 when it
 * is not** — counted across the whole selection, not per region.
 *
 * ## Why this can be enforced without any geography
 *
 * The backend has no regions, cities or districts (CLAUDE.md § "Core
 * architectural decision") and must not grow them. It does not need them here:
 * `ServiceAreaDto.type` already says whether an entry is a `district`, and
 * Yerevan is the only place in the country that has districts. So "is this
 * Yerevan?" is answerable from the payload's own shape, with no lookup table to
 * keep in sync with the frontend's data files.
 *
 * ## MANUAL SYNC POINT
 *
 * `frontend/constants/serviceAreaLimits.ts` is this file's twin. The frontend
 * copy decides what a driver is *offered* — it greys out the checkboxes. This
 * copy decides what is *accepted*, and it is the only one that is a real
 * boundary: a disabled checkbox is a hint, not a constraint, and anything that
 * speaks HTTP can ignore it.
 */

import { BadRequestException } from '@nestjs/common'
import type { ServiceAreaDto } from './dto/service-area.dto'

/** Budget when exactly one marz is chosen and Yerevan is not among them */
export const MAX_AREAS_ONE_REGION = 3

/** Budget when two marzes are chosen and Yerevan is not among them — shared between both */
export const MAX_AREAS_TWO_REGIONS = 5

/** Budget when Yerevan IS among the regions — see the frontend twin for why it is lower */
export const MAX_AREAS_WITH_YEREVAN = 2

/** A driver may cover at most this many marzes */
export const MAX_REGIONS = 2

/**
 * Yerevan's slug, as it appears in `regionSlugs`.
 *
 * This is NOT the start of a geography table. It is one string, needed because
 * the registration payload carries region slugs but no types — the same
 * category of hand-mirrored constant as `AVAILABLE_24_7_SLUG` in
 * `service-slugs.ts`. Nothing else about Yerevan is known here, and nothing
 * else should become known here.
 */
export const YEREVAN_REGION_SLUG = 'yerevan'

/** Yerevan has exactly this many districts — the ceiling for the exempt half */
export const YEREVAN_DISTRICT_COUNT = 12

function tooManyMessage(max: number): string {
  return `Կարող եք ընտրել առավելագույնը ${max} քաղաք կամ ուղղություն։ Հեռացրեք ավելորդները։`
}

/**
 * The strict check, for payloads that carry `type` — admin approval and the
 * driver's own dashboard. Both are the moment data becomes public or changes
 * what is already public, so both get the exact rule rather than a bound.
 *
 * Throws rather than returning a boolean: every caller's only correct response
 * is to refuse the write, and a returned flag is a thing a future caller can
 * forget to read.
 */
export function assertServiceAreasWithinLimit(
  areas: readonly ServiceAreaDto[],
  regionSlugs?: readonly string[],
): void {
  const counted = areas.filter((area) => area.type !== 'district').length

  // Yerevan is readable from the payload alone: only Yerevan has districts.
  if (areas.some((area) => area.type === 'district')) {
    if (counted > MAX_AREAS_WITH_YEREVAN) {
      throw new BadRequestException(tooManyMessage(MAX_AREAS_WITH_YEREVAN))
    }
    return
  }

  // One marz or two is NOT readable from the payload — five cities in Lori and
  // five spread over Lori + Armavir are the same list of typed areas here, and
  // resolving a city to its marz would mean putting geography in the backend,
  // which is the one thing this codebase does not do (CLAUDE.md).
  //
  // So the caller passes the region list when it has one. When it does not, the
  // loosest legitimate budget applies: still a correct bound (no valid
  // selection is ever rejected), just not the tighter one-marz rule. Every
  // caller in this repo does pass it — the parameter is optional so that an
  // older client, or a future one that forgets, degrades to "too permissive"
  // rather than to "rejects everything".
  const max =
    regionSlugs === undefined || regionSlugs.length >= 2
      ? MAX_AREAS_TWO_REGIONS
      : MAX_AREAS_ONE_REGION

  if (counted > max) {
    throw new BadRequestException(tooManyMessage(max))
  }
}

/**
 * The bound, for the registration payload — which carries flat slugs with no
 * types, because `RegistrationRequest.citySlugs` has always been a plain
 * `String[]` and changing that would rewrite the moderation queue's shape for
 * every pending row.
 *
 * Without types the backend cannot tell a Yerevan district from a Kotayk city,
 * so it cannot apply the exact rule here. What it *can* do is refuse anything
 * that no honest selection could produce:
 *
 * | Regions | Provable maximum |
 * | --- | --- |
 * | Yerevan only | 12 districts |
 * | Yerevan + a marz | 12 districts + 2 = 14 |
 * | one marz | 3 — exact, the region list is right here |
 * | two marzes | 5 — likewise exact |
 *
 * A crafted request could still slip 14 marz cities through this. That request
 * does not become a listing: it lands in the moderation queue, and the admin's
 * approval sends the same areas back **typed**, where
 * `assertServiceAreasWithinLimit` above rejects it. So the exact rule is always
 * applied before anything is published — this bound exists to stop the queue
 * being filled with nonsense, not as the only line of defence.
 */
export function assertRegistrationAreasWithinLimit(
  regionSlugs: readonly string[],
  citySlugs: readonly string[],
): void {
  const yerevanSelected = regionSlugs.includes(YEREVAN_REGION_SLUG)
  const otherRegions = regionSlugs.filter((slug) => slug !== YEREVAN_REGION_SLUG).length

  if (!yerevanSelected) {
    // Registration is the one endpoint that receives the region list outright,
    // so the exact one-marz rule applies here with no inference at all.
    const max = regionSlugs.length >= 2 ? MAX_AREAS_TWO_REGIONS : MAX_AREAS_ONE_REGION
    if (citySlugs.length > max) {
      throw new BadRequestException(tooManyMessage(max))
    }
    return
  }

  const max =
    otherRegions > 0 ? YEREVAN_DISTRICT_COUNT + MAX_AREAS_WITH_YEREVAN : YEREVAN_DISTRICT_COUNT

  if (citySlugs.length > max) {
    throw new BadRequestException(
      otherRegions > 0
        ? tooManyMessage(MAX_AREAS_WITH_YEREVAN)
        : 'Ընտրված տարածքները չափազանց շատ են',
    )
  }
}
