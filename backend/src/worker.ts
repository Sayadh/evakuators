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
import { beat, HttpWatch, pm2Name } from './live-dispatch/notify/ops-watch'
import { recordError } from './error-tracking/error-store'

const RECONCILE_EVERY_MS = 3_000
const HOUSEKEEPING_EVERY_MS = 3_600_000
/** Wake pushes for locked phones whose heartbeat is going stale (PushService.wakeStaleDrivers) */
const WAKE_EVERY_MS = 15_000
/** «I am alive» for the API's watchdog (notify/ops-watch.ts) */
const BEAT_EVERY_MS = 15_000
/** The worker's watch on the API process — the one thing the API cannot report itself */
const API_WATCH_EVERY_MS = 60_000

function log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void {
  // One JSON line per event: PM2 log rotation + grep-able. Never tokens, never
  // full phone numbers, never coordinates.
  process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), level, message, ...data })}\n`)
}

async function main(): Promise<void> {
  const config = readLiveDispatchConfig(process.env)
  if (!config.enabled) {
    log('warn', 'LIVE_DISPATCH_ENABLED is not "true" — worker idles (no outbox, no reconciler)')
  } else if (!config.redisUrl) {
    // Realtime hints are published by THIS process; WebSockets live in the API
    // process. Without Redis they never meet — dispatch still works (DB is the
    // truth, apps/console re-read on push, on a timer and on reconnect), but
    // nothing is instant.
    log('warn', 'REDIS_URL is empty — realtime hints will not reach WebSocket clients (apps/console fall back to periodic re-reads)')
  }
  const prisma = new PrismaClient()
  await prisma.$connect()
  const runtime = createRuntime(new PrismaSqlDatabase(prisma), config, {
    logger: { info: (m, d) => log('info', m, d), warn: (m, d) => log('warn', m, d) },
  })
  // Error tracking (2026-11-17): a job that keeps failing, not every transient retry
  const track = (message: string, error: unknown, context: Record<string, unknown>) =>
    void recordError(
      runtime.db,
      { source: 'worker', message, stack: error instanceof Error ? (error.stack ?? null) : null, context },
      { ops: runtime.ops, frontendUrl: config.frontendUrl },
    )
  const processor = runtime.createProcessor((message, error) => {
    if (message.attempts >= Math.min(3, message.maxAttempts)) {
      track(`${message.topic}: ${(error as Error)?.message ?? String(error)}`, error, { topic: message.topic, attempts: message.attempts })
    }
  })
  let stopping = false
  let reconcileTimer: NodeJS.Timeout | null = null
  let housekeepingTimer: NodeJS.Timeout | null = null
  let wakeTimer: NodeJS.Timeout | null = null

  // Watchdogs (2026-11-17): this process proves it is alive, and watches the API
  const sendBeat = () => beat(runtime.db, 'worker', { workerId: processor.workerId }).catch((error: Error) => log('error', 'heartbeat failed', { error: error.message }))
  void sendBeat()
  const beatTimer = setInterval(sendBeat, BEAT_EVERY_MS)
  const apiWatch = new HttpWatch(`http://127.0.0.1:${process.env.PORT ?? 4002}/api/v1/health`, runtime.ops, {
    down: '🔴 Backend-ը (API) չի պատասխանում — կայքը, admin-ը և վարորդի հավելվածը չեն աշխատում։\nՍերվերում՝ pm2 logs ' + pm2Name('backend', process.env.name) + ' --lines 50',
    up: '🟢 Backend-ը (API) նորից պատասխանում է։',
  })
  const apiWatchTimer = setInterval(() => {
    apiWatch
      .check()
      .then((sent) => {
        if (sent) log(sent === 'down' ? 'error' : 'info', `api watch: ${sent}`)
      })
      .catch((error: Error) => log('error', 'api watch failed', { error: error.message }))
  }, API_WATCH_EVERY_MS)

  if (config.enabled) {
    processor.start()
    const reconcile = async () => {
      if (stopping) return
      try {
        const report = await runtime.reconciler.run(await runtime.settings.get())
        if (Object.values(report).some((n) => n > 0)) log('info', 'reconcile', report as unknown as Record<string, unknown>)
      } catch (error) {
        log('error', 'reconcile failed', { error: (error as Error).message })
        track(`reconcile: ${(error as Error).message}`, error, {})
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
      // Monthly clean slate for pre-orders (2026-11-18): closed ones of past months go, open ones stay
      try {
        const purged = await runtime.preOrders.purgePastMonths()
        if (purged > 0) log('info', 'pre-orders purged', { purged })
      } catch (error) {
        log('error', 'pre-order purge failed', { error: (error as Error).message })
      }
    }
    housekeepingTimer = setInterval(housekeeping, HOUSEKEEPING_EVERY_MS)
    wakeTimer = setInterval(() => {
      runtime.push
        .wakeStaleDrivers()
        .then((woken) => {
          if (woken > 0) log('info', 'wake pushes', { woken })
        })
        .catch((error: Error) => log('error', 'wake failed', { error: error.message }))
      // Problem alerts (2026-11-16): «GPS-ը չի աշխատում» / «Կապ չկա», with a sound
      runtime.settings
        .get()
        .then((settings) => runtime.push.alertProblemDrivers(settings))
        .then((alerted) => {
          if (alerted > 0) log('info', 'problem alerts', { alerted })
        })
        .catch((error: Error) => log('error', 'problem alerts failed', { error: error.message }))
    }, WAKE_EVERY_MS)
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
    if (wakeTimer) clearInterval(wakeTimer)
    clearInterval(beatTimer)
    clearInterval(apiWatchTimer)
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
