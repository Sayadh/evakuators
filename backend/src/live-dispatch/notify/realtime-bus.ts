/**
 * Fan-out of realtime events from whichever process committed the change
 * (usually the worker) to the API process that holds the WebSockets.
 *
 * Every event carries the outbox row id as `eventId`. Clients dedupe on it,
 * and — because delivery is best-effort — re-read a full snapshot after any
 * reconnect instead of assuming they saw every event.
 */
import { EventEmitter } from 'node:events'
import { RedisPublisher, RedisSubscriber, type RedisOptions } from './redis-resp'

export interface RealtimeEvent {
  eventId: string
  /** 'admin' | `driver:<driverId>` */
  audiences: string[]
  event: string
  data: Record<string, unknown>
  at: string
}

export interface RealtimeBus {
  publish(event: RealtimeEvent): Promise<void>
  subscribe(handler: (event: RealtimeEvent) => void): () => void
  close(): void
}

export const REALTIME_CHANNEL = 'evakuators:live-dispatch:realtime'

/** Single process (development, tests, or API+worker in one process) */
export class InProcessBus implements RealtimeBus {
  private readonly emitter = new EventEmitter()

  async publish(event: RealtimeEvent): Promise<void> {
    this.emitter.emit('event', event)
  }

  subscribe(handler: (event: RealtimeEvent) => void): () => void {
    this.emitter.on('event', handler)
    return () => this.emitter.off('event', handler)
  }

  close(): void {
    this.emitter.removeAllListeners()
  }
}

export class RedisBus implements RealtimeBus {
  private readonly publisher: RedisPublisher
  private subscriber: RedisSubscriber | null = null
  private readonly handlers = new Set<(event: RealtimeEvent) => void>()

  constructor(private readonly options: RedisOptions) {
    this.publisher = new RedisPublisher(options)
  }

  async publish(event: RealtimeEvent): Promise<void> {
    await this.publisher.publish(REALTIME_CHANNEL, JSON.stringify(event))
  }

  subscribe(handler: (event: RealtimeEvent) => void): () => void {
    this.handlers.add(handler)
    if (!this.subscriber) {
      this.subscriber = new RedisSubscriber(this.options, REALTIME_CHANNEL, (raw) => {
        let event: RealtimeEvent
        try {
          event = JSON.parse(raw) as RealtimeEvent
        } catch {
          return
        }
        for (const h of this.handlers) h(event)
      })
      void this.subscriber.start()
    }
    return () => this.handlers.delete(handler)
  }

  get healthy(): Promise<boolean> {
    return this.publisher.ping()
  }

  close(): void {
    this.subscriber?.stop()
    this.publisher.close()
  }
}
