import { Injectable } from '@nestjs/common'
import { Prisma, ProfileChangeStatus, type ProfileChangeRequest } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/** A queued edit together with enough of the truck to name it in the panel */
export type ProfileChangeWithTruck = ProfileChangeRequest & {
  towTruck: { id: number; slug: string; driverName: string; companyName: string | null }
}

@Injectable()
export class ProfileChangesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The one request awaiting review for this truck, if any */
  findPendingForTruck(towTruckId: number): Promise<ProfileChangeRequest | null> {
    return this.prisma.profileChangeRequest.findFirst({
      where: { towTruckId, status: ProfileChangeStatus.PENDING },
    })
  }

  /**
   * The most recent decision on this truck, so the dashboard can show a
   * rejection reason once and stop.
   *
   * Only ever read when there is no pending request — a driver who has
   * resubmitted is looking at the new attempt, not at why the last one was
   * refused.
   */
  findLastReviewedForTruck(towTruckId: number): Promise<ProfileChangeRequest | null> {
    return this.prisma.profileChangeRequest.findFirst({
      where: { towTruckId, status: { not: ProfileChangeStatus.PENDING } },
      orderBy: { reviewedAt: 'desc' },
    })
  }

  findById(id: number): Promise<ProfileChangeWithTruck | null> {
    return this.prisma.profileChangeRequest.findUnique({
      where: { id },
      include: {
        towTruck: { select: { id: true, slug: true, driverName: true, companyName: true } },
      },
    })
  }

  list(
    status: ProfileChangeStatus | undefined,
    limit: number,
    offset: number,
  ): Promise<ProfileChangeWithTruck[]> {
    return this.prisma.profileChangeRequest.findMany({
      where: status ? { status } : undefined,
      include: {
        towTruck: { select: { id: true, slug: true, driverName: true, companyName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    })
  }

  countPending(): Promise<number> {
    return this.prisma.profileChangeRequest.count({
      where: { status: ProfileChangeStatus.PENDING },
    })
  }

  /**
   * Queues an edit, replacing whatever this truck already had waiting.
   *
   * An upsert in spirit, written as a transaction because the uniqueness that
   * makes it one is a **partial** index (`WHERE status = 'PENDING'`) — Prisma
   * cannot target that with `upsert`, and there is no other unique key to
   * upsert on. Doing it in one transaction is what stops a double submit from
   * leaving the old row pending while a new one is created; the partial index
   * is the backstop if it somehow does.
   *
   * Replacing rather than appending is the product rule (see the model): two
   * queued edits to one profile cannot be applied in a defined order.
   *
   * `imageIds` on the new diff are re-pointed at this request so the nightly
   * orphan purge leaves them alone while it waits — and the previous request's
   * photos are released, because a superseded edit's uploads are exactly what
   * that purge exists to collect.
   */
  async replacePending(
    towTruckId: number,
    changes: Prisma.InputJsonObject,
    before: Prisma.InputJsonObject,
    newImageIds: number[],
  ): Promise<ProfileChangeRequest> {
    return this.prisma.$transaction(async (tx) => {
      await tx.profileChangeRequest.deleteMany({
        where: { towTruckId, status: ProfileChangeStatus.PENDING },
      })

      const created = await tx.profileChangeRequest.create({
        data: { towTruckId, changes, before },
      })

      if (newImageIds.length > 0) {
        await tx.towTruckImage.updateMany({
          where: { id: { in: newImageIds } },
          data: { profileChangeRequestId: created.id },
        })
      }

      return created
    })
  }

  /** Withdraws the driver's own pending edit — nothing was ever applied, so this deletes it */
  async deletePending(towTruckId: number): Promise<number> {
    const result = await this.prisma.profileChangeRequest.deleteMany({
      where: { towTruckId, status: ProfileChangeStatus.PENDING },
    })
    return result.count
  }

  markReviewed(
    id: number,
    status: ProfileChangeStatus,
    rejectionReason?: string,
  ): Promise<ProfileChangeRequest> {
    return this.prisma.profileChangeRequest.update({
      where: { id },
      data: { status, reviewedAt: new Date(), rejectionReason: rejectionReason ?? null },
    })
  }
}
