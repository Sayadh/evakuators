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
}
