import type { ProfileChangeRequest } from '@prisma/client'
import type {
  DriverProfileChangeStatusApi,
  ProfileChangeApi,
  ProfileChangeFieldApi,
} from './profile-change.types'
import type { ProfileChangeWithTruck } from './profile-changes.repository'

/**
 * The stored diff, as a list a UI can render row by row.
 *
 * ## Why a list and not the raw object
 *
 * `changes` and `before` are two JSON objects keyed the same way, which is the
 * right shape for applying an update and the wrong one for showing one: a
 * client would have to zip them itself, and every client would have to agree on
 * what a key present in one and absent from the other means. Zipping here makes
 * the response say exactly what the review is — a list of «this field, was
 * that, now this».
 *
 * ## Driven by `before`, not by `changes`
 *
 * `changes` additionally carries the context an approval needs to be
 * applicable: the marz list for the coverage cap, and the base placement
 * whenever `serviceAreas` moved (see `CARRY_WITH` in the diff). None of that is
 * something the driver edited, and a moderator reading four lines for a
 * one-line coverage change would be reading the machinery rather than the edit.
 *
 * `before` holds exactly the genuine changes, so iterating it IS the rule —
 * rather than a second list of exclusions that could drift from the first.
 */
export function toProfileChangeFields(request: {
  changes: unknown
  before: unknown
}): ProfileChangeFieldApi[] {
  const changes = (request.changes ?? {}) as Record<string, unknown>
  const before = (request.before ?? {}) as Record<string, unknown>

  return Object.keys(before).map((field) => ({
    field,
    before: before[field] ?? null,
    after: changes[field] ?? null,
  }))
}

export function toProfileChangeApi(request: ProfileChangeWithTruck): ProfileChangeApi {
  return {
    id: request.id,
    towTruckId: request.towTruckId,
    towTruckSlug: request.towTruck.slug,
    driverName: request.towTruck.driverName,
    companyName: request.towTruck.companyName ?? undefined,
    status: request.status,
    fields: toProfileChangeFields(request),
    rejectionReason: request.rejectionReason ?? undefined,
    createdAt: request.createdAt.toISOString(),
    reviewedAt: request.reviewedAt?.toISOString(),
  }
}

export function toDriverProfileChangeStatus(status: {
  pending: ProfileChangeRequest | null
  lastReviewed: ProfileChangeRequest | null
}): DriverProfileChangeStatusApi {
  return {
    pending: status.pending
      ? {
          id: status.pending.id,
          fields: toProfileChangeFields(status.pending),
          createdAt: status.pending.createdAt.toISOString(),
        }
      : null,
    lastReviewed:
      status.lastReviewed && status.lastReviewed.status !== 'PENDING'
        ? {
            id: status.lastReviewed.id,
            status: status.lastReviewed.status,
            rejectionReason: status.lastReviewed.rejectionReason ?? undefined,
            reviewedAt: status.lastReviewed.reviewedAt?.toISOString(),
          }
        : null,
  }
}
