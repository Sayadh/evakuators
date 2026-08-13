import { BadRequestException } from '@nestjs/common'
import type { ServiceAreaJson } from './tow-truck.types'

/**
 * The one rule about a tow truck's structural placement.
 *
 * `TowTruck.citySlug`/`districtSlug` is what the browsing pages filter on and
 * what «Հիմնական գտնվելու վայրը» shows on every card. A truck filed under a
 * place it does not actually serve is the worst kind of wrong here: it ranks
 * *first* on that town's page (see `sortTowTrucks` on the frontend, which puts
 * locally-based drivers above everyone else) while being the one driver who
 * never agreed to go there.
 *
 * So: **the placement must always name one of the served areas.** Three write
 * paths can set it — approval, the admin primary-area editor, and the admin
 * area-removal endpoint when it re-points a placement it just deleted — and all
 * three check it here rather than each carrying its own copy.
 *
 * ## What this can and cannot check
 *
 * It checks membership in a list the caller already has, which needs no
 * geography and is therefore something this backend is allowed to know
 * (CLAUDE.md). It does NOT check that a `city` placement really is a city, or
 * that `regionSlug` is the marz that city belongs to — both would require the
 * geography tables this codebase deliberately does not have. Those stay the
 * frontend's responsibility, resolved from the static data and sent, exactly
 * like `ServiceAreaDto.name`.
 *
 * ## A corridor base is an EMPTY placement, not a corridor in `citySlug`
 *
 * A driver really can be based on a road — «Արագած–Ծաղկահովիտ» is where some of
 * them wait, and refusing to record that left an admin with two selects and no
 * honest answer in them.
 *
 * It is expressed by leaving `citySlug` and `districtSlug` **null** and putting
 * the corridor's name in `locationName`. That is the whole trick: the label on
 * the card is truthful, and the columns the browsing pages filter on stay empty,
 * so the truck simply does not appear on any city page — which is correct,
 * because it is not in a city. Writing the corridor slug into `citySlug`
 * instead would file it under a listing that does not exist, which is why that
 * is still refused below.
 *
 * `routeSlug` is how a caller says "the empty placement is deliberate, and this
 * is the road". It is validated here and **never stored** — same shape as
 * `regionSlugs` on the coverage endpoints. Without it, "based on a corridor" and
 * "forgot to choose" are the same request, and `setTowTruckPrimaryArea` could
 * not tell them apart.
 */
export function assertPlacementIsServed(
  areas: readonly ServiceAreaJson[],
  placement: {
    citySlug?: string | null
    districtSlug?: string | null
    /** Validation-only: the served corridor the truck is based on. Never stored. */
    routeSlug?: string | null
  },
): void {
  const { citySlug, districtSlug, routeSlug } = placement

  if (citySlug && districtSlug) {
    throw new BadRequestException(
      'Հիմնական տեղակայումը կարող է լինել կա՛մ քաղաք, կա՛մ Երևանի շրջան, ոչ թե երկուսը միասին։',
    )
  }

  if (routeSlug) {
    if (citySlug || districtSlug) {
      throw new BadRequestException(
        'Հիմնական տեղակայումը կարող է լինել կա՛մ բնակավայր, կա՛մ ուղղություն, ոչ թե երկուսը միասին։',
      )
    }

    const route = areas.find((candidate) => candidate.slug === routeSlug)
    if (!route) {
      throw new BadRequestException(
        `«${routeSlug}»-ը էվակուատորի սպասարկվող տարածքների մեջ չէ, ուստի չի կարող լինել նրա հիմնական տեղակայումը։`,
      )
    }
    // Checked rather than assumed: a caller sending a city slug here would
    // otherwise store an empty placement for a truck that has a real city page
    // to rank on, and lose that ranking silently.
    if (route.type !== 'route') {
      throw new BadRequestException(
        `«${route.name}»-ը բնակավայր է, ոչ թե ուղղություն — նշեք այն citySlug-ով կամ districtSlug-ով։`,
      )
    }
    return
  }

  const slug = citySlug ?? districtSlug
  // Nothing to check. Callers that require a placement enforce that themselves;
  // an empty one is legitimate for a truck covering only road corridors.
  if (!slug) return

  const area = areas.find((candidate) => candidate.slug === slug)

  if (!area) {
    throw new BadRequestException(
      `«${slug}»-ը էվակուատորի սպասարկվող տարածքների մեջ չէ, ուստի չի կարող լինել նրա հիմնական տեղակայումը։`,
    )
  }

  if (area.type === 'route') {
    throw new BadRequestException(
      `«${area.name}»-ը ուղղություն է, ոչ թե բնակավայր, ուստի չի կարող լինել հիմնական տեղակայում։`,
    )
  }

  // A district slug filed as a city (or the reverse) would put the truck in the
  // wrong half of the browsing tree — Yerevan districts and marz cities are
  // matched by different columns, so the row would simply never be found.
  const expected = area.type === 'district' ? 'districtSlug' : 'citySlug'
  const given = citySlug ? 'citySlug' : 'districtSlug'

  if (expected !== given) {
    throw new BadRequestException(
      area.type === 'district'
        ? `«${area.name}»-ը Երևանի շրջան է և պետք է նշվի districtSlug-ով։`
        : `«${area.name}»-ը քաղաք է և պետք է նշվի citySlug-ով։`,
    )
  }
}
