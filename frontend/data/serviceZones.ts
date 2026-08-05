/**
 * Static data — same standing as regions/cities/districts: geography does not
 * come from the API, it lives here as the single source of truth (see
 * CLAUDE.md § "Core architectural decision").
 *
 * ## What a service zone is, and what it is not
 *
 * A named road corridor a driver works as a whole — «Գառնի–Գեղարդ»,
 * «Տաթև–Հալիձոր». Drivers asked for these because the places along them are
 * not cities and the roads are what they actually cover.
 *
 * A zone is NOT a settlement and implies nothing about the settlements on it.
 * A driver who picks «Գառնի–Գեղարդ» is saying "I work that road", not "I serve
 * Գառնի" and not "I serve Գեղարդ". So a zone matches on its own slug and
 * nothing else — no expansion to nearby places, no radius, no fallback. A
 * visitor who picks «Գառնի–Գեղարդ» sees exactly the drivers who picked
 * «Գառնի–Գեղարդ».
 *
 * The one place a zone behaves like a city is the region rollup: a driver who
 * covers a zone in Kotayk counts as serving Kotayk, because that is already how
 * covering a city in Kotayk works and a visitor browsing the marz would
 * otherwise never see them.
 *
 * `regionId` references `staticRegions`. Slugs share one namespace with cities
 * and districts — they are all `serviceAreas[].slug` values and all appear in
 * `/regions/:region/:slug` — so a new zone slug must not collide with an
 * existing city or district slug.
 */
import type { ServiceZone } from '~/types/location'

export const staticServiceZones: ServiceZone[] = [
  // Արագածոտն (regionId 1)
  { id: 1, regionId: 1, name: 'Բյուրական–Ամբերդ', slug: 'byurakan-amberd' },
  { id: 2, regionId: 1, name: 'Արագած–Ծաղկահովիտ', slug: 'aragats-tsaghkahovit' },

  // Արարատ (regionId 2)
  { id: 3, regionId: 2, name: 'Երասխ', slug: 'yeraskh' },

  // Գեղարքունիք (regionId 4)
  { id: 4, regionId: 4, name: 'Վարդենիկ–Ծակքար', slug: 'vardenik-tsakkar' },

  // Կոտայք (regionId 5)
  { id: 5, regionId: 5, name: 'Գառնի–Գեղարդ', slug: 'garni-geghard' },
  { id: 6, regionId: 5, name: 'Բջնի–Արզական', slug: 'bjni-arzakan' },

  // Լոռի (regionId 6)
  { id: 7, regionId: 6, name: 'Օձուն–Հաղպատ', slug: 'odzun-haghpat' },

  // Սյունիք (regionId 8)
  { id: 8, regionId: 8, name: 'Տաթև–Հալիձոր', slug: 'tatev-halidzor' },
  { id: 9, regionId: 8, name: 'Խնձորեսկ–Կոռնիձոր', slug: 'khndzoresk-kornidzor' },

  // Տավուշ (regionId 9)
  { id: 10, regionId: 9, name: 'Ենոքավան', slug: 'yenokavan' },
  { id: 11, regionId: 9, name: 'Գոշ–Հաղարծին', slug: 'gosh-haghartsin' },

  // Վայոց Ձոր (regionId 10)
  { id: 12, regionId: 10, name: 'Արենի–Նորավանք', slug: 'areni-noravank' },
]
