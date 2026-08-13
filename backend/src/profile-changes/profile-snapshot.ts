import { decimalToNumber } from '../common/coordinates'
import type { TowTruckWithImages } from '../tow-trucks/tow-truck.types'
import { EDITABLE_PROFILE_FIELDS } from './profile-change-diff'

/**
 * The live profile, flattened to exactly the keys a driver's PATCH uses.
 *
 * `diffProfile` compares like with like, so both sides have to be keyed the
 * same way. The Prisma row already is, almost: every editable column is named
 * after its DTO field. Three things need work, and each is a bug if skipped:
 *
 * - **`imageIds`** is not a column at all. The gallery lives in a related table,
 *   in `position` order, and the DTO expresses it as an ordered id list — so it
 *   is assembled here rather than compared against something that does not
 *   exist. Without it every save would report the photos as changed.
 * - **`latitude`/`longitude`** are `Decimal(9,6)`, which arrive as decimal.js
 *   instances. Comparing one against the number a driver submitted is always
 *   "different", so the coordinate dialog would queue a change every time it was
 *   opened and saved untouched.
 * - **`regionSlugs`** has no stored counterpart and is deliberately absent —
 *   see `ALWAYS_CARRIED` in the diff.
 *
 * Built by walking `EDITABLE_PROFILE_FIELDS` rather than by listing the keys
 * again, so a field added to the allow-list cannot be forgotten here and
 * silently start reporting itself as changed on every save.
 */
export function currentProfileSnapshot(
  towTruck: TowTruckWithImages,
): Record<string, unknown> {
  const row = towTruck as unknown as Record<string, unknown>
  const snapshot: Record<string, unknown> = {}

  for (const field of EDITABLE_PROFILE_FIELDS) {
    switch (field) {
      case 'imageIds':
        // Already in gallery order — the include that produced this row orders
        // by `position` (see IMAGE_ORDER).
        snapshot.imageIds = towTruck.images.map((image) => image.id)
        break
      case 'latitude':
        snapshot.latitude = decimalToNumber(towTruck.latitude) ?? null
        break
      case 'longitude':
        snapshot.longitude = decimalToNumber(towTruck.longitude) ?? null
        break
      case 'regionSlugs':
        // No stored counterpart; carried on every diff instead.
        break
      default:
        snapshot[field] = row[field] ?? null
    }
  }

  return snapshot
}
