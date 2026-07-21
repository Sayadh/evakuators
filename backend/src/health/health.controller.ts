import { Controller, Get } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

interface HealthStatus {
  status: 'ok'
  database: 'up' | 'down'
  timestamp: string
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthStatus> {
    let database: HealthStatus['database'] = 'down'
    try {
      await this.prisma.$queryRaw`SELECT 1`
      database = 'up'
    } catch {
      database = 'down'
    }

    return {
      status: 'ok',
      database,
      timestamp: new Date().toISOString(),
    }
  }
}
