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

  /** One specific challenge — the one a pending token was issued for */
  findById(id: number): Promise<AdminOtp | null> {
    return this.prisma.adminOtp.findUnique({ where: { id } })
  }

  incrementAttempts(id: number): Promise<AdminOtp> {
    return this.prisma.adminOtp.update({ where: { id }, data: { attempts: { increment: 1 } } })
  }

  /**
   * Claims this challenge, atomically. Returns true for exactly one caller.
   *
   * The naive sequence — read the row, check it is usable, then consume it —
   * has a window between the check and the write in which another request can
   * do the same. Two requests carrying the same pending token and the same
   * correct code would both read "usable" and both be issued a full 24-hour
   * admin session from one second factor.
   *
   * Every condition therefore lives in the UPDATE's own WHERE, so Postgres
   * arbitrates on a locked row: the first statement flips `consumedAt`, the
   * second matches nothing and reports `count === 0`. Same principle as
   * `AnalyticsRepository.recordEvent()` and
   * `TowTrucksRepository.claimContactNoticeIntro()` — the database decides,
   * never a read-then-write in application code.
   *
   * `userId` is part of the WHERE rather than checked beforehand for the same
   * reason: it is a condition of the claim, not a separate step that could be
   * raced past.
   */
  async consumeIfUnused(id: number, userId: number, maxAttempts: number): Promise<boolean> {
    const result = await this.prisma.adminOtp.updateMany({
      where: {
        id,
        userId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: maxAttempts },
      },
      data: { consumedAt: new Date() },
    })
    return result.count === 1
  }

  /**
   * Records one failed guess, atomically, and reports whether it was allowed.
   *
   * `attempts: { lt: maxAttempts }` in the WHERE together with
   * `{ increment: 1 }` in the data is a single row-locked
   * `UPDATE … SET attempts = attempts + 1 WHERE attempts < n`. Concurrent
   * requests serialise on that row, so N of them can never push the counter
   * past the limit — which a read-then-`incrementAttempts()` pair would allow,
   * since all N would read the same pre-limit value first.
   *
   * @returns false when the challenge is already exhausted, expired or spent.
   */
  async registerFailedAttempt(id: number, userId: number, maxAttempts: number): Promise<boolean> {
    const result = await this.prisma.adminOtp.updateMany({
      where: {
        id,
        userId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: maxAttempts },
      },
      data: { attempts: { increment: 1 } },
    })
    return result.count === 1
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

  /** Same unbounded-growth cleanup as DriverOtpRepository.deleteExpiredBefore() */
  async deleteExpiredBefore(cutoff: Date): Promise<number> {
    const result = await this.prisma.adminOtp.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    return result.count
  }
}
