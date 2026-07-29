import { Injectable } from '@nestjs/common'
import type { Prisma, RegistrationRequest, TowTruckImage } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export type RegistrationWithImages = RegistrationRequest & { images: TowTruckImage[] }

@Injectable()
export class RegistrationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the request and attaches previously uploaded images in one
   * transaction.
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
   */
  create(
    data: Prisma.RegistrationRequestUncheckedCreateInput,
    imageIds: number[],
  ): Promise<RegistrationWithImages> {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.registrationRequest.create({ data })

      for (const [position, id] of imageIds.entries()) {
        // updateMany, not update: the `towTruckId: null` guard makes an id
        // that was attached elsewhere between validation and here a silent
        // no-op instead of a thrown transaction.
        await tx.towTruckImage.updateMany({
          where: { id, towTruckId: null },
          data: { registrationRequestId: request.id, position },
        })
      }

      return tx.registrationRequest.findUniqueOrThrow({
        where: { id: request.id },
        include: { images: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
      })
    })
  }

  countUnattachedImages(imageIds: number[]): Promise<number> {
    return this.prisma.towTruckImage.count({
      where: { id: { in: imageIds }, towTruckId: null, registrationRequestId: null },
    })
  }
}
