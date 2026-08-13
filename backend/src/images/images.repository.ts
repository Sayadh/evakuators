import { Injectable } from '@nestjs/common'
import { ProfileChangeStatus, RegistrationStatus, type Prisma, type TowTruckImage } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { IMAGE_ORDER } from './image-order'

/** All TowTruckImage database access lives here — services never touch Prisma directly */
@Injectable()
export class ImagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.TowTruckImageUncheckedCreateInput): Promise<TowTruckImage> {
    return this.prisma.towTruckImage.create({ data })
  }

  /**
   * Images that no longer belong to anything a user can reach:
   *
   * 1. **Never attached.** `POST /images` creates a row before the registration
   *    form is submitted, so an abandoned (or malicious) upload leaves a row and
   *    a Supabase object with both foreign keys null, forever. The public upload
   *    endpoint accepts 30MB files, so this is the one place in the system where
   *    an anonymous request permanently costs money.
   * 2. **Attached to a rejected registration.** `AdminService.reject()`
   *    deliberately keeps the RegistrationRequest row as an audit trail, but the
   *    photos are of no further use — and nothing was deleting them, so every
   *    rejected application's images stayed in the bucket indefinitely.
   *
   * The age cutoff protects an in-progress registration: a driver may sit on the
   * form for a while between uploading and submitting.
   */
  findOrphaned(uploadedBefore: Date, rejectedBefore: Date): Promise<TowTruckImage[]> {
    return this.prisma.towTruckImage.findMany({
      where: {
        OR: [
          {
            towTruckId: null,
            registrationRequestId: null,
            // A third owner: a driver's queued profile edit. Without this
            // clause the photos of a change request that had been waiting
            // longer than the TTL would be deleted out from under a moderator
            // who had not looked at it yet, and approving it would then fail on
            // images that no longer exist. See
            // TowTruckImage.profileChangeRequestId.
            profileChangeRequestId: null,
            createdAt: { lt: uploadedBefore },
          },
          {
            // A DECIDED edit's leftover photos, on the same delay a refused
            // registration's get: long enough that a moderator who rejected by
            // mistake can still change their mind, short enough that a bucket
            // does not accumulate them.
            //
            // `not: PENDING` rather than `REJECTED`, and the difference is a
            // leak: an APPROVED request can also leave photos behind — the ones
            // the driver dropped from the gallery before the moderator looked.
            // Those have no towTruckId (never applied) and a non-null
            // profileChangeRequestId (so the "never attached" branch above
            // skips them), and would sit in Storage forever.
            towTruckId: null,
            profileChangeRequest: {
              status: { not: ProfileChangeStatus.PENDING },
              reviewedAt: { lt: rejectedBefore },
            },
          },
          {
            towTruckId: null,
            registrationRequest: {
              status: RegistrationStatus.REJECTED,
              updatedAt: { lt: rejectedBefore },
            },
          },
        ],
      },
    })
  }

  async deleteByIds(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0
    const result = await this.prisma.towTruckImage.deleteMany({ where: { id: { in: ids } } })
    return result.count
  }

  findByTowTruckId(towTruckId: number): Promise<TowTruckImage[]> {
    return this.prisma.towTruckImage.findMany({ where: { towTruckId }, orderBy: IMAGE_ORDER })
  }

  /**
   * The images among `ids` that this caller is allowed to claim.
   *
   * "Unclaimed" means owned by nobody: no truck, no registration request, no
   * queued profile edit. All three have to be checked, because an image with
   * any one of them set already belongs to somebody, and an id is a small
   * sequential integer — guessing one is not an attack that needs skill.
   *
   * `profileChangeRequestId` was the gap. When queued profile edits became a
   * third owner, a photo sitting in one driver's pending edit still had
   * `towTruckId: null` and `registrationRequestId: null`, so another driver
   * could name that id in their own save and have it attached to their gallery
   * on approval — while the first driver's edit then failed on an image that
   * was no longer theirs.
   *
   * `allowProfileChangeRequestId` is how an approval gets its own photos back:
   * at that moment they are legitimately owned by the request being applied,
   * and by nothing else. Any other request's photos stay out of reach.
   */
  findUnattachedByIds(
    ids: number[],
    allowProfileChangeRequestId?: number,
  ): Promise<TowTruckImage[]> {
    if (ids.length === 0) return Promise.resolve([])
    return this.prisma.towTruckImage.findMany({
      where: {
        id: { in: ids },
        towTruckId: null,
        registrationRequestId: null,
        // `in: [null, id]` rather than a bare id, because at submission time
        // the photos are fresh uploads owned by nobody, and at approval time
        // they are owned by the request being applied. Both are legitimate;
        // every other value is somebody else's.
        profileChangeRequestId:
          allowProfileChangeRequestId === undefined
            ? null
            : ({ in: [null, allowProfileChangeRequestId] } as Prisma.IntNullableFilter),
      },
    })
  }

  /**
   * Makes `orderedIds` the truck's gallery, in exactly that order — attaching
   * anything not attached yet and rewriting every `position` to match the
   * array index, so index 0 is the main photo.
   *
   * One statement per image (six at most) rather than a single updateMany,
   * because updateMany can only write the same value to every row and the
   * whole point here is that each row gets a different position. Run as one
   * `$transaction` so a gallery is never left half-renumbered — two images
   * both claiming position 2 would reintroduce exactly the ambiguity
   * IMAGE_ORDER's tiebreak exists to paper over.
   *
   * Scoped with `towTruckId: { in: [null, towTruckId] }`: an id belonging to
   * somebody else's truck matches no row and is a silent no-op rather than a
   * way to reassign another driver's photo. MyTowTruckService validates the
   * ids before calling this; this is the second lock on the same door.
   */
  async applyGallery(orderedIds: number[], towTruckId: number): Promise<void> {
    if (orderedIds.length === 0) return
    await this.prisma.$transaction(
      orderedIds.map((id, position) =>
        this.prisma.towTruckImage.updateMany({
          // OR rather than `in: [null, towTruckId]` — Prisma's Int filter
          // treats null as "unset the filter", not as a value to match.
          where: { id, OR: [{ towTruckId: null }, { towTruckId }] },
          data: { towTruckId, position },
        }),
      ),
    )
  }

  /**
   * Releases images from a truck without deleting anything.
   *
   * Both foreign keys are cleared, which is what makes the row match
   * `findOrphaned()`'s "never attached" branch on the next nightly run — that
   * job is the single owner of Supabase Storage deletion and already handles a
   * failed delete correctly (keeps the rows, retries tomorrow). Deleting the
   * rows here instead would throw away `path`, the only record of which bucket
   * object belongs to which row, and leak the file forever if Storage happened
   * to be unreachable at that moment.
   */
  async detachFromTowTruck(ids: number[]): Promise<void> {
    if (ids.length === 0) return
    await this.prisma.towTruckImage.updateMany({
      where: { id: { in: ids } },
      data: { towTruckId: null, registrationRequestId: null },
    })
  }
}
