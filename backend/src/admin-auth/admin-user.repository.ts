import { Injectable } from '@nestjs/common'
import { UserRole, type User } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/** All User (admin account) database access lives here — services never touch Prisma directly */
@Injectable()
export class AdminUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAdminByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email, role: UserRole.ADMIN } })
  }

  findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } })
  }

  /** Every admin who has connected Telegram — used to broadcast notifications */
  findAllWithTelegramLinked(): Promise<User[]> {
    return this.prisma.user.findMany({
      where: { role: UserRole.ADMIN, telegramChatId: { not: null } },
    })
  }

  findByTelegramLinkToken(token: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { telegramLinkToken: token, telegramLinkTokenExpiresAt: { gt: new Date() } },
    })
  }

  setTelegramLinkToken(id: number, token: string, expiresAt: Date): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { telegramLinkToken: token, telegramLinkTokenExpiresAt: expiresAt },
    })
  }

  /**
   * Same unique-constraint-safe pattern as TowTrucksRepository.linkTelegramChat
   * (see that comment for the full story) — free this chatId from any other
   * admin row first, inside a transaction, so a stale/duplicate link can
   * never throw an uncaught 500 from the webhook.
   */
  linkTelegramChat(id: number, chatId: bigint): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { telegramChatId: chatId, id: { not: id } },
        data: { telegramChatId: null },
      })
      return tx.user.update({
        where: { id },
        data: { telegramChatId: chatId, telegramLinkToken: null, telegramLinkTokenExpiresAt: null },
      })
    })
  }
}
