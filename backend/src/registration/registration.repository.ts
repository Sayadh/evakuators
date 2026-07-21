import { Injectable } from '@nestjs/common'
import type { Prisma, RegistrationRequest, TowTruckImage } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export type RegistrationWithImages = RegistrationRequest & { images: TowTruckImage[] }

@Injectable()
export class RegistrationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the request and attaches previously uploaded images in one transaction */
  create(
    data: Prisma.RegistrationRequestUncheckedCreateInput,
    imageIds: number[],
  ): Promise<RegistrationWithImages> {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.registrationRequest.create({ data })
      await tx.towTruckImage.updateMany({
        where: { id: { in: imageIds }, towTruckId: null },
        data: { registrationRequestId: request.id },
      })
      return tx.registrationRequest.findUniqueOrThrow({
        where: { id: request.id },
        include: { images: true },
      })
    })
  }

  countUnattachedImages(imageIds: number[]): Promise<number> {
    return this.prisma.towTruckImage.count({
      where: { id: { in: imageIds }, towTruckId: null, registrationRequestId: null },
    })
  }
}
