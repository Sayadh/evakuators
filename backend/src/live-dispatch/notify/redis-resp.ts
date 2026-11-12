/**
 * A minimal Redis client (RESP2) for exactly two jobs: PUBLISH, and a
 * SUBSCRIBE connection that reconnects by itself. No dependency added.
 *
 * Redis carries realtime fan-out ONLY (worker → API WebSocket gateway). It is
 * never a source of truth: losing it delays live screen updates until the
 * clients' next snapshot read, and changes nothing about orders or offers.
 */
import net from 'node:net'

export interface RedisOptions {
  host: string
  port: number
  password?: string
  db?: number
}

export function parseRedisUrl(url: string): RedisOptions {
  const parsed = new URL(url)
  return {
    host: parsed.hostname || '127.0.0.1',
    port: Number(parsed.port || 6379),
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: parsed.pathname && parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined,
  }
}

function encode(args: string[]): Buffer {
  const parts = [`*${args.length}\r\n`]
  for (const arg of args) parts.push(`$${Buffer.byteLength(arg)}\r\n${arg}\r\n`)
  return Buffer.from(parts.join(''))
}

type Reply = string | number | null | Reply[] | Error

/** Incremental RESP2 parser; returns [value, bytesConsumed] or null if incomplete */
function parse(buffer: Buffer, offset = 0): [Reply, number] | null {
  if (offset >= buffer.length) return null
  const lineEnd = buffer.indexOf('\r\n', offset)
  if (lineEnd === -1) return null
  const type = String.fromCharCode(buffer[offset])
  const line = buffer.toString('utf8', offset + 1, lineEnd)
  const next = lineEnd + 2
  switch (type) {
    case '+':
      return [line, next]
    case '-':
      return [new Error(line), next]
    case ':':
      return [Number(line), next]
    case '$': {
      const length = Number(line)
      if (length === -1) return [null, next]
      if (buffer.length < next + length + 2) return null
      return [buffer.toString('utf8', next, next + length), next + length + 2]
    }
    case '*': {
      const count = Number(line)
      if (count === -1) return [null, next]
      const items: Reply[] = []
      let cursor = next
      for (let i = 0; i < count; i++) {
        const item = parse(buffer, cursor)
        if (!item) return null
        items.push(item[0])
        cursor = item[1]
      }
      return [items, cursor]
    }
    default:
      throw new Error(`RESP: unexpected type byte ${type}`)
  }
}

class Connection {
  socket: net.Socket | null = null
  private buffer = Buffer.alloc(0)
  private readonly waiting: { resolve: (reply: Reply) => void; reject: (error: Error) => void }[] = []

  constructor(
    private readonly options: RedisOptions,
    private readonly onPush?: (reply: Reply) => void,
    private readonly onClose?: () => void,
  ) {}

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host: this.options.host, port: this.options.port })
      socket.setNoDelay(true)
      socket.once('connect', () => resolve())
      socket.once('error', reject)
      socket.on('data', (chunk: Buffer) => this.onData(chunk))
      socket.on('close', () => {
        for (const waiter of this.waiting.splice(0)) waiter.reject(new Error('redis connection closed'))
        this.socket = null
        this.onClose?.()
      })
      socket.on('error', () => undefined)
      this.socket = socket
    })
    if (this.options.password) await this.command(['AUTH', this.options.password])
    if (this.options.db) await this.command(['SELECT', String(this.options.db)])
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    for (;;) {
      const parsed = parse(this.buffer)
      if (!parsed) return
      this.buffer = this.buffer.subarray(parsed[1])
      const [reply] = parsed
      if (this.onPush && Array.isArray(reply) && reply[0] === 'message') {
        this.onPush(reply)
        continue
      }
      const waiter = this.waiting.shift()
      if (!waiter) continue
      if (reply instanceof Error) waiter.reject(reply)
      else waiter.resolve(reply)
    }
  }

  command(args: string[]): Promise<Reply> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('redis not connected'))
        return
      }
      this.waiting.push({ resolve, reject })
      this.socket.write(encode(args))
    })
  }

  close(): void {
    this.socket?.end()
    this.socket?.destroy()
  }
}

export class RedisPublisher {
  private connection: Connection | null = null
  private connecting: Promise<Connection> | null = null

  constructor(private readonly options: RedisOptions) {}

  private async conn(): Promise<Connection> {
    if (this.connection?.socket) return this.connection
    if (!this.connecting) {
      const connection = new Connection(this.options, undefined, () => {
        this.connection = null
      })
      this.connecting = connection.open().then(
        () => {
          this.connection = connection
          this.connecting = null
          return connection
        },
        (error) => {
          this.connecting = null
          throw error
        },
      )
    }
    return this.connecting
  }

  /** @returns number of subscribers that received it */
  async publish(channel: string, message: string): Promise<number> {
    const connection = await this.conn()
    return Number(await connection.command(['PUBLISH', channel, message]))
  }

  async ping(): Promise<boolean> {
    try {
      const connection = await this.conn()
      return (await connection.command(['PING'])) === 'PONG'
    } catch {
      return false
    }
  }

  close(): void {
    this.connection?.close()
    this.connection = null
  }
}

/** A subscription that re-subscribes after any disconnect, with capped backoff */
export class RedisSubscriber {
  private connection: Connection | null = null
  private stopped = false
  private backoffMs = 250
  onReconnect: (() => void) | null = null

  constructor(
    private readonly options: RedisOptions,
    private readonly channel: string,
    private readonly onMessage: (message: string) => void,
  ) {}

  async start(): Promise<void> {
    this.stopped = false
    await this.connect()
  }

  private async connect(): Promise<void> {
    while (!this.stopped) {
      try {
        const connection = new Connection(
          this.options,
          (reply) => {
            const parts = reply as Reply[]
            if (parts[1] === this.channel && typeof parts[2] === 'string') this.onMessage(parts[2])
          },
          () => {
            this.connection = null
            if (!this.stopped) setTimeout(() => void this.connect(), this.backoffMs)
          },
        )
        await connection.open()
        await connection.command(['SUBSCRIBE', this.channel])
        this.connection = connection
        if (this.backoffMs > 250) this.onReconnect?.()
        this.backoffMs = 250
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, this.backoffMs))
        this.backoffMs = Math.min(this.backoffMs * 2, 10_000)
      }
    }
  }

  get connected(): boolean {
    return this.connection?.socket != null
  }

  stop(): void {
    this.stopped = true
    this.connection?.close()
    this.connection = null
  }
}
