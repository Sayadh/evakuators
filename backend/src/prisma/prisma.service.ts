import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

/**
 * Single PrismaClient instance for the whole application.
 * Connection is established lazily on the first query, so the app
 * can boot (and /health can respond) even while the DB is starting up.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
