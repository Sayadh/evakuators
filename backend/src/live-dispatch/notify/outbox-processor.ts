/**
 * The worker loop that drains the outbox.
 *
 * At-least-once: a row is claimed with a lease (`lockedUntil`); if the worker
 * dies mid-handler the lease expires and another claim picks it up. Handlers
 * are idempotent (they re-check the authoritative row), so a re-run is safe.
 * Failures back off exponentially; past `maxAttempts` the row stays as a
 * visible dead letter (counted in metrics/health), never silently dropped.
 */
import { randomUUID } from 'node:crypto'
import type { SqlDatabase } from '../platform/sql'
import { claimDue, markFailed, markProcessed, type ClaimedMessage, type OutboxTopic } from './outbox'

export type OutboxHandler = (message: ClaimedMessage) => Promise<'done' | 'retry'>

export interface ProcessorMetrics {
  processed: number
  failed: number
  retried: number
  lagMs: number[]
}

export class OutboxProcessor {
  readonly workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`
  readonly metrics: ProcessorMetrics = { processed: 0, failed: 0, retried: 0, lagMs: [] }
  private running = false
  private loop: Promise<void> | null = null

  constructor(
    private readonly db: SqlDatabase,
    private readonly handlers: Partial<Record<OutboxTopic, OutboxHandler>>,
    private readonly options: { batchSize: number; idleDelayMs: number; concurrency: number } = {
      batchSize: 25,
      idleDelayMs: 300,
      concurrency: 8,
    },
    private readonly onError: (message: ClaimedMessage, error: unknown) => void = () => undefined,
  ) {}

  /** One claim-and-handle round; returns how many messages it took */
  async tick(): Promise<number> {
    const batch = await claimDue(this.db, this.workerId, this.options.batchSize)
    let index = 0
    const runNext = async (): Promise<void> => {
      while (index < batch.length) {
        const message = batch[index++]
        await this.handle(message)
      }
    }
    await Promise.all(Array.from({ length: Math.min(this.options.concurrency, batch.length) }, runNext))
    return batch.length
  }

  private async handle(message: ClaimedMessage): Promise<void> {
    const handler = this.handlers[message.topic]
    this.metrics.lagMs.push(Date.now() - message.createdAt.getTime())
    if (this.metrics.lagMs.length > 1000) this.metrics.lagMs.shift()
    if (!handler) {
      await markFailed(this.db, message.id, this.workerId, `no handler for ${message.topic}`, message.attempts)
      this.metrics.failed++
      return
    }
    try {
      const outcome = await handler(message)
      if (outcome === 'retry') {
        await markFailed(this.db, message.id, this.workerId, 'handler asked to retry', message.attempts)
        this.metrics.retried++
      } else {
        await markProcessed(this.db, message.id, this.workerId)
        this.metrics.processed++
      }
    } catch (error) {
      this.metrics.failed++
      this.onError(message, error)
      await markFailed(this.db, message.id, this.workerId, (error as Error).message ?? String(error), message.attempts).catch(() => undefined)
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.loop = (async () => {
      while (this.running) {
        let taken = 0
        try {
          taken = await this.tick()
        } catch {
          taken = 0
        }
        if (taken === 0 && this.running) await new Promise((resolve) => setTimeout(resolve, this.options.idleDelayMs))
      }
    })()
  }

  /** Graceful: finishes the batch in hand, claims nothing new */
  async stop(): Promise<void> {
    this.running = false
    await this.loop
  }
}
