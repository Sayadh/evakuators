/**
 * The live-dispatch WORKER process — `node dist/worker.js` (PM2:
 * `evakuators-worker`). Binds no port.
 *
 * Runs: the outbox loop (dispatch steps, offer expiries, pushes, realtime
 * fan-out), the reconciler every few seconds, and hourly housekeeping.
 * Shares nothing with the API process but Postgres (truth) and Redis
 * (fan-out), so it can move to another machine with no code change.
 *
 * Safe to run more than one: outbox claims use SKIP LOCKED and every handler
 * is idempotent. Safe to kill at any moment: work in flight is re-claimed when
 * its lease expires, and the reconciler repairs anything a lost job left.
 */
import 'reflect-metadata'
import { PrismaClient } from '@prisma/client'
import { PrismaSqlDatabase } from './live-dispatch/platform/prisma-sql'
import { createRuntime, readLiveDispatchConfig } from './live-dispatch/runtime'

const RECONCILE_EVERY_MS = 3_000
const HOUSEKEEPING_EVERY_MS = 3_600_000

function log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void {
  // One JSON line per event: PM2 log rotation + grep-able. Never tokens, never
  // full phone numbers, never coordinates.
  process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), level, message, ...data })}\n`)
}

async function main(): Promise<void> {
  const config = readLiveDispatchConfig(process.env)
  if (!config.enabled) {
    log('warn', 'LIVE_DISPATCH_ENABLED is not "true" — worker idles (no outbox, no reconciler)')
  }
  const prisma = new PrismaClient()
  await prisma.$connect()
  const runtime = createRuntime(new PrismaSqlDatabase(prisma), config, {
    logger: { info: (m, d) => log('info', m, d), warn: (m, d) => log('warn', m, d) },
  })
  const processor = runtime.createProcessor()
  let stopping = false
  let reconcileTimer: NodeJS.Timeout | null = null
  let housekeepingTimer: NodeJS.Timeout | null = null

  if (config.enabled) {
    processor.start()
    const reconcile = async () => {
      if (stopping) return
      try {
        const report = await runtime.reconciler.run(await runtime.settings.get())
        if (Object.values(report).some((n) => n > 0)) log('info', 'reconcile', report as unknown as Record<string, unknown>)
      } catch (error) {
        log('error', 'reconcile failed', { error: (error as Error).message })
      }
      if (!stopping) reconcileTimer = setTimeout(reconcile, RECONCILE_EVERY_MS)
    }
    void reconcile()
    const housekeeping = async () => {
      try {
        const removed = await runtime.reconciler.housekeeping(await runtime.settings.get(), (days) => runtime.fleet.purgeLocationHistory(days))
        log('info', 'housekeeping', removed)
      } catch (error) {
        log('error', 'housekeeping failed', { error: (error as Error).message })
      }
    }
    housekeepingTimer = setInterval(housekeeping, HOUSEKEEPING_EVERY_MS)
    log('info', 'worker started', { workerId: processor.workerId, routing: config.routingProvider, push: config.pushProvider })
  }

  const metricsTimer = setInterval(() => {
    const lag = processor.metrics.lagMs
    const sorted = [...lag].sort((a, b) => a - b)
    log('info', 'metrics', {
      outboxProcessed: processor.metrics.processed,
      outboxFailed: processor.metrics.failed,
      outboxRetried: processor.metrics.retried,
      outboxLagP95Ms: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : null,
      routingRequests: runtime.routing.metrics.requests,
      routingElements: runtime.routing.metrics.elements,
      routingErrors: runtime.routing.metrics.errors,
      routingBudgetRefusals: runtime.routing.metrics.budgetRefusals,
      rssMb: Math.round(process.memoryUsage().rss / 1_048_576),
    })
  }, 60_000)

  const shutdown = async (signal: string) => {
    if (stopping) return
    stopping = true
    log('info', 'shutting down', { signal })
    if (reconcileTimer) clearTimeout(reconcileTimer)
    if (housekeepingTimer) clearInterval(housekeepingTimer)
    clearInterval(metricsTimer)
    await processor.stop()
    runtime.bus.close()
    await prisma.$disconnect()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error) => {
  log('error', 'worker failed to start', { error: (error as Error).message })
  process.exit(1)
})
