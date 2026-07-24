import { Injectable } from '@nestjs/common'
import type { AdminOtp, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/** Mirrors DriverOtpRepository exactly, keyed to User (admin) instead of TowTruck */
@Injectable()
export class AdminOtpRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: number, codeHash: string, expiresAt: Date): Promise<AdminOtp> {
    return this.prisma.adminOtp.create({ data: { userId, codeHash, expiresAt } })
  }

  /** Most recent, still-usable (not consumed, not expired) code for this admin */
  findActive(userId: number): Promise<AdminOtp | null> {
    return this.prisma.adminOtp.findFirst({
      where: { userId, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
  }

  incrementAttempts(id: number): Promise<AdminOtp> {
    return this.prisma.adminOtp.update({ where: { id }, data: { attempts: { increment: 1 } } })
  }

  /** Consumes every still-active code for this admin before a new one is created */
  invalidateActive(userId: number): Promise<Prisma.BatchPayload> {
    return this.prisma.adminOtp.updateMany({
      where: { userId, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    })
  }

  consume(id: number): Promise<AdminOtp> {
    return this.prisma.adminOtp.update({ where: { id }, data: { consumedAt: new Date() } })
  }
}
