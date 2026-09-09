import { Injectable } from '@nestjs/common'
import type { Prisma, RegistrationRequest, TowTruckImage } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export type RegistrationWithImages = RegistrationRequest & { images: TowTruckImage[] }

@Injectable()
export class RegistrationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the request, records the driver's privacy consent and attaches
   * previously uploaded images — all in one transaction.
   *
   * `imageIds` is ORDERED — the driver's main photo is `imageIds[0]` (see
   * register.vue's selectedFiles()) — and that order is persisted here as
   * `position`. It has to be written per row rather than in one updateMany,
   * because updateMany can only set the same value for every row. Six updates
   * at most, inside the transaction that was already open.
   *
   * Without this every image kept `position: 0` and the "main photo" was
   * whatever Postgres happened to return first, which could differ between
   * two requests for the same truck.
   *
   * ## Why the consent is written here and not by the service afterwards
   *
   * A registration stored without its consent would be a driver's data held
   * with no record of permission to hold it — which is the one outcome this
   * whole feature exists to prevent, and a second `create` call after the
   * transaction commits is exactly how it would happen (a crash, a dropped
   * connection, a Postgres restart in the millisecond between the two). The
   * callback receives the transaction client so the consent row is part of the
   * same atomic write: both rows exist or neither does.
   */
  create(
    data: Prisma.RegistrationRequestUncheckedCreateInput,
    imageIds: number[],
    recordConsent: (registrationRequestId: number, tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<RegistrationWithImages> {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.registrationRequest.create({ data })

      // Before the images, so a failure here costs nothing that has to be
      // cleaned up — the whole transaction rolls back and the uploaded photos
      // stay unattached, which the nightly orphan purge already handles.
      await recordConsent(request.id, tx)

      for (const [position, id] of imageIds.entries()) {
        // updateMany, not update: an id that was claimed by somebody else
        // between validation and here becomes a silent no-op instead of a
        // thrown transaction.
        //
        // All three owners, like the count above — guarding only `towTruckId`
        // left the window the count was supposed to close wide open anyway, so
        // the check and the write now ask the same question.
        await tx.towTruckImage.updateMany({
          where: { id, towTruckId: null, registrationRequestId: null, profileChangeRequestId: null },
          data: { registrationRequestId: request.id, position },
        })
      }

      return tx.registrationRequest.findUniqueOrThrow({
        where: { id: request.id },
        include: { images: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
      })
    })
  }

  /**
   * How many of these images are owned by nobody.
   *
   * All THREE owners, matching `ImagesRepository.findUnattachedByIds`. This
   * checked only two, and the missing one was `profileChangeRequestId` — a
   * photo sitting in a driver's queued profile edit still has a null truck and
   * a null registration request, so it counted as free here and this endpoint
   * takes no authentication at all.
   *
   * That made it the cheapest version of the attack the images repository's own
   * comment describes: an anonymous registration naming a guessed id would take
   * a photo out of a driver's pending edit — breaking that edit's approval
   * permanently — and show it to the moderator as its own, who on approval
   * would move it onto the new listing.
   */
  countUnattachedImages(imageIds: number[]): Promise<number> {
    return this.prisma.towTruckImage.count({
      where: {
        id: { in: imageIds },
        towTruckId: null,
        registrationRequestId: null,
        profileChangeRequestId: null,
      },
    })
  }
}
