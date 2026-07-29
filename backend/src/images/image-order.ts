import type { Prisma } from '@prisma/client'

/**
 * The one ordering every query that returns images must use.
 *
 * `position` is the driver's own order — index 0 is the main photo they picked
 * at registration (see RegistrationRepository.create) or the order they left
 * their gallery in (see ImagesRepository.applyOrder). It is what makes "the
 * first image" mean the same thing on a listing card, on the profile gallery,
 * in the og:image tag and in the admin panel.
 *
 * `id` is the tiebreak, and it is not optional. Every row created before
 * `position` was actually written carries the column default of 0, so ordering
 * by `position` alone leaves those rows in whatever order Postgres feels like
 * returning them — which can differ between two runs of the identical query.
 * Falling back to `id` makes that legacy data resolve to upload order, which is
 * exactly the order the driver submitted them in anyway.
 */
export const IMAGE_ORDER = [
  { position: 'asc' },
  { id: 'asc' },
] satisfies Prisma.TowTruckImageOrderByWithRelationInput[]
