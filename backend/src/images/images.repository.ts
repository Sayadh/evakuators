import { Injectable } from '@nestjs/common'
import { RegistrationStatus, type Prisma, type TowTruckImage } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

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
            createdAt: { lt: uploadedBefore },
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
    return this.prisma.towTruckImage.findMany({ where: { towTruckId } })
  }

  findUnattachedByIds(ids: number[]): Promise<TowTruckImage[]> {
    if (ids.length === 0) return Promise.resolve([])
    return this.prisma.towTruckImage.findMany({
      where: { id: { in: ids }, towTruckId: null, registrationRequestId: null },
    })
  }

  async attachToTowTruck(ids: number[], towTruckId: number): Promise<void> {
    if (ids.length === 0) return
    await this.prisma.towTruckImage.updateMany({
      where: { id: { in: ids } },
      data: { towTruckId },
    })
  }
}
