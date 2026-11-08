import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { LiveDispatchService } from '../live-dispatch.service'
import { PrismaSqlDatabase } from '../platform/prisma-sql'
import { createRuntime, readLiveDispatchConfig, type LiveDispatchRuntime } from '../runtime'

/**
 * Holds the framework-free runtime for the API process. The API never runs
 * the outbox loop or the reconciler — that is `worker.ts`, a separate PM2
 * process — so a slow dispatch step can never block an HTTP request.
 */
@Injectable()
export class LiveDispatchRuntimeHolder implements OnModuleDestroy {
  private readonly logger = new Logger('LiveDispatch')
  readonly runtime: LiveDispatchRuntime
  readonly service: LiveDispatchService

  constructor(prisma: PrismaService) {
    const config = readLiveDispatchConfig(process.env)
    this.runtime = createRuntime(new PrismaSqlDatabase(prisma), config, {
      logger: { info: (m, d) => this.logger.log(`${m} ${d ? JSON.stringify(d) : ''}`), warn: (m, d) => this.logger.warn(`${m} ${d ? JSON.stringify(d) : ''}`) },
    })
    this.service = new LiveDispatchService(this.runtime)
    this.logger.log(
      `flags: dispatch=${config.enabled} tracking=${config.trackingEnabled} liveNearby=${config.liveNearbyEnabled} ` +
        `routing=${config.routingProvider} push=${config.pushProvider} redis=${config.redisUrl ? 'on' : 'off'}`,
    )
  }

  onModuleDestroy(): void {
    this.runtime.bus.close()
  }
}
