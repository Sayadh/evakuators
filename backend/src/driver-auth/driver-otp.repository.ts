import { Injectable } from '@nestjs/common'
import type { DriverOtp, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class DriverOtpRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(towTruckId: number, codeHash: string, expiresAt: Date): Promise<DriverOtp> {
    return this.prisma.driverOtp.create({ data: { towTruckId, codeHash, expiresAt } })
  }

  /** Most recent, still-usable (not consumed, not expired) code for this driver */
  findActive(towTruckId: number): Promise<DriverOtp | null> {
    return this.prisma.driverOtp.findFirst({
      where: { towTruckId, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
  }

  incrementAttempts(id: number): Promise<DriverOtp> {
    return this.prisma.driverOtp.update({ where: { id }, data: { attempts: { increment: 1 } } })
  }

  /**
   * Consumes every still-active code for this driver. Called right before
   * creating a new one so there's never more than one valid code at a time —
   * otherwise a driver who scrolls back to an older Telegram message and
   * enters that (still-unexpired) code would end up in a confusing state.
   */
  invalidateActive(towTruckId: number): Promise<Prisma.BatchPayload> {
    return this.prisma.driverOtp.updateMany({
      where: { towTruckId, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    })
  }

  consume(id: number): Promise<DriverOtp> {
    return this.prisma.driverOtp.update({ where: { id }, data: { consumedAt: new Date() } })
  }
}
