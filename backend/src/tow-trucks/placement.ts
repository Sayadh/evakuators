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
 * A road corridor is rejected as a placement even though it is a served area:
 * nobody is "based in" «Գառնի–Գեղարդ», and writing a corridor slug into
 * `citySlug` would file the driver under a city listing that does not exist.
 */
export function assertPlacementIsServed(
  areas: readonly ServiceAreaJson[],
  placement: { citySlug?: string | null; districtSlug?: string | null },
): void {
  const { citySlug, districtSlug } = placement

  if (citySlug && districtSlug) {
    throw new BadRequestException(
      'Հիմնական տեղակայումը կարող է լինել կա՛մ քաղաք, կա՛մ Երևանի շրջան, ոչ թե երկուսը միասին։',
    )
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
