/**
 * A minimal PostgreSQL wire-protocol (v3) client for the integration tests.
 *
 * TEST SUPPORT ONLY — production talks to Postgres through Prisma
 * (`platform/prisma-sql.ts`). It exists so the live-dispatch SQL can be run
 * against a REAL server, with REAL concurrent transactions, without adding a
 * driver dependency to the project.
 *
 * Supports exactly what the tests need: trust / cleartext / MD5 auth, the
 * extended query protocol with text-format parameters (so `$1` placeholders
 * behave exactly as they do through Prisma), and text-format results decoded
 * by type OID. One query at a time per connection; a `PgPool` hands out
 * connections for parallelism.
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'
import net from 'node:net'
import { SqlError, type IsolationLevel, type Row, type Sql, type SqlDatabase, type SqlParam } from '../platform/sql'

export interface PgConnectionOptions {
  host: string
  port: number
  user: string
  database: string
  password?: string
}

interface Field {
  name: string
  typeOid: number
}

interface Pending {
  resolve: (rows: Row[]) => void
  reject: (error: Error) => void
  fields: Field[]
  rows: Row[]
  error: SqlError | null
}

export function parseConnectionString(url: string): PgConnectionOptions {
  const parsed = new URL(url)
  return {
    host: parsed.hostname || '127.0.0.1',
    port: Number(parsed.port || 5432),
    user: decodeURIComponent(parsed.username || 'postgres'),
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    database: parsed.pathname.replace(/^\//, '') || 'postgres',
  }
}

function cstring(value: string): Buffer {
  return Buffer.concat([Buffer.from(value, 'utf8'), Buffer.from([0])])
}

function message(type: string, body: Buffer): Buffer {
  const header = Buffer.alloc(5)
  header.write(type, 0, 'ascii')
  header.writeInt32BE(body.length + 4, 1)
  return Buffer.concat([header, body])
}

function int16(value: number): Buffer {
  const buffer = Buffer.alloc(2)
  buffer.writeInt16BE(value)
  return buffer
}

function int32(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeInt32BE(value)
  return buffer
}

function encodeParam(value: SqlParam): Buffer | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return Buffer.from(value.toISOString(), 'utf8')
  if (typeof value === 'boolean') return Buffer.from(value ? 't' : 'f', 'utf8')
  return Buffer.from(String(value), 'utf8')
}

function parseTextArray(text: string): string[] {
  // Simple 1-D array literal parser: {a,"b c",NULL}
  const inner = text.slice(1, -1)
  if (inner === '') return []
  const out: string[] = []
  let current = ''
  let quoted = false
  let wasQuoted = false
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (quoted) {
      if (ch === '\\') {
        current += inner[++i]
      } else if (ch === '"') {
        quoted = false
      } else {
        current += ch
      }
    } else if (ch === '"') {
      quoted = true
      wasQuoted = true
    } else if (ch === ',') {
      out.push(!wasQuoted && current === 'NULL' ? (null as unknown as string) : current)
      current = ''
      wasQuoted = false
    } else {
      current += ch
    }
  }
  out.push(!wasQuoted && current === 'NULL' ? (null as unknown as string) : current)
  return out
}

function decode(typeOid: number, text: string): unknown {
  switch (typeOid) {
    case 16:
      return text === 't'
    case 20: {
      const asNumber = Number(text)
      return Number.isSafeInteger(asNumber) ? asNumber : BigInt(text)
    }
    case 21:
    case 23:
    case 26:
    case 700:
    case 701:
    case 1700:
      return Number(text)
    case 114:
    case 3802:
      return JSON.parse(text)
    case 1114:
      // timestamp WITHOUT time zone: the codebase stores UTC in these
      return new Date(text.replace(' ', 'T') + 'Z')
    case 1184:
      return new Date(text.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'))
    case 1005:
    case 1007:
    case 1016:
      return parseTextArray(text).map((item) => (item === null ? null : Number(item)))
    case 1009:
    case 1015:
    case 2951:
      return parseTextArray(text)
    default:
      return text
  }
}

export class PgWireClient implements Sql {
  private socket!: net.Socket
  private buffer = Buffer.alloc(0)
  private queue: Pending[] = []
  private scram: { nonce: string; firstBare: string; serverSignature?: Buffer } | null = null
  private chain: Promise<unknown> = Promise.resolve()
  private readyResolve: (() => void) | null = null
  private readyReject: ((error: Error) => void) | null = null
  private closed = false
  private pid = 0

  constructor(private readonly options: PgConnectionOptions) {}

  get backendPid(): number {
    return this.pid
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
      this.socket = net.createConnection({ host: this.options.host, port: this.options.port })
      this.socket.on('data', (chunk: Buffer) => this.onData(chunk))
      this.socket.on('error', (error) => this.fail(error))
      this.socket.on('close', () => {
        this.closed = true
        this.fail(new Error('connection closed'))
      })
      this.socket.on('connect', () => {
        const body = Buffer.concat([
          int32(196608),
          cstring('user'),
          cstring(this.options.user),
          cstring('database'),
          cstring(this.options.database),
          cstring('client_encoding'),
          cstring('UTF8'),
          cstring('TimeZone'),
          cstring('UTC'),
          Buffer.from([0]),
        ])
        this.socket.write(Buffer.concat([int32(body.length + 4), body]))
      })
    })
  }

  private fail(error: Error): void {
    if (this.readyReject) {
      this.readyReject(error)
      this.readyReject = null
      this.readyResolve = null
    }
    for (const pending of this.queue.splice(0)) pending.reject(error)
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 5) {
      const type = String.fromCharCode(this.buffer[0])
      const length = this.buffer.readInt32BE(1)
      if (this.buffer.length < length + 1) return
      const body = this.buffer.subarray(5, length + 1)
      this.buffer = this.buffer.subarray(length + 1)
      this.handle(type, body)
    }
  }

  private handle(type: string, body: Buffer): void {
    const pending = this.queue[0]
    switch (type) {
      case 'R': {
        const code = body.readInt32BE(0)
        if (code === 0) return
        if (code === 3) {
          this.socket.write(message('p', cstring(this.options.password ?? '')))
          return
        }
        if (code === 5) {
          const salt = body.subarray(4, 8)
          const inner = createHash('md5')
            .update((this.options.password ?? '') + this.options.user)
            .digest('hex')
          const outer = createHash('md5').update(Buffer.concat([Buffer.from(inner), salt])).digest('hex')
          this.socket.write(message('p', cstring('md5' + outer)))
          return
        }
        if (code === 10) {
          // SASL: the default since PostgreSQL 14 and in Postgres.app.
          const mechanisms = body.toString('utf8', 4).split('\0')
          if (!mechanisms.includes('SCRAM-SHA-256')) {
            this.fail(new Error(`unsupported SASL mechanisms ${mechanisms.join(',')}`))
            return
          }
          const nonce = randomBytes(18).toString('base64')
          const firstBare = `n=*,r=${nonce}`
          this.scram = { nonce, firstBare }
          const first = Buffer.from(`n,,${firstBare}`)
          const len = Buffer.alloc(4)
          len.writeInt32BE(first.length)
          this.socket.write(message('p', Buffer.concat([cstring('SCRAM-SHA-256'), len, first])))
          return
        }
        if (code === 11 && this.scram) {
          const serverFirst = body.toString('utf8', 4)
          const attrs = Object.fromEntries(serverFirst.split(',').map((kv) => [kv[0], kv.slice(2)]))
          if (!String(attrs.r).startsWith(this.scram.nonce)) {
            this.fail(new Error('SCRAM: server nonce mismatch'))
            return
          }
          const salted = pbkdf2Sync(this.options.password ?? '', Buffer.from(String(attrs.s), 'base64'), Number(attrs.i), 32, 'sha256')
          const clientKey = createHmac('sha256', salted).update('Client Key').digest()
          const storedKey = createHash('sha256').update(clientKey).digest()
          const finalBare = `c=biws,r=${attrs.r}`
          const authMessage = `${this.scram.firstBare},${serverFirst},${finalBare}`
          const signature = createHmac('sha256', storedKey).update(authMessage).digest()
          const proof = Buffer.from(clientKey.map((b, i) => b ^ signature[i]))
          const serverKey = createHmac('sha256', salted).update('Server Key').digest()
          this.scram.serverSignature = createHmac('sha256', serverKey).update(authMessage).digest()
          this.socket.write(message('p', Buffer.from(`${finalBare},p=${proof.toString('base64')}`)))
          return
        }
        if (code === 12 && this.scram) {
          const verifier = body.toString('utf8', 4).replace(/^v=/, '')
          const ok = this.scram.serverSignature && Buffer.from(verifier, 'base64').equals(this.scram.serverSignature)
          this.scram = null
          if (!ok) this.fail(new Error('SCRAM: server signature mismatch'))
          return
        }
        this.fail(new Error(`unsupported auth method ${code}`))
        return
      }
      case 'K':
        this.pid = body.readInt32BE(0)
        return
      case 'S':
      case 'N':
      case '1':
      case '2':
      case 'n':
      case 's':
      case 'A':
        return
      case 'T': {
        if (!pending) return
        const count = body.readInt16BE(0)
        let offset = 2
        const fields: Field[] = []
        for (let i = 0; i < count; i++) {
          const end = body.indexOf(0, offset)
          const name = body.toString('utf8', offset, end)
          offset = end + 1
          const typeOid = body.readInt32BE(offset + 6)
          offset += 18
          fields.push({ name, typeOid })
        }
        pending.fields = fields
        return
      }
      case 'D': {
        if (!pending) return
        const count = body.readInt16BE(0)
        let offset = 2
        const row: Row = {}
        for (let i = 0; i < count; i++) {
          const length = body.readInt32BE(offset)
          offset += 4
          const field = pending.fields[i]
          if (length === -1) {
            row[field.name] = null
          } else {
            row[field.name] = decode(field.typeOid, body.toString('utf8', offset, offset + length))
            offset += length
          }
        }
        pending.rows.push(row)
        return
      }
      case 'C':
        return
      case 'E': {
        const fields: Record<string, string> = {}
        let offset = 0
        while (offset < body.length && body[offset] !== 0) {
          const key = String.fromCharCode(body[offset])
          const end = body.indexOf(0, offset + 1)
          fields[key] = body.toString('utf8', offset + 1, end)
          offset = end + 1
        }
        const error = new SqlError(fields.M ?? 'database error', fields.C ?? 'XX000', fields.n, fields.D)
        if (pending) {
          pending.error = error
        } else if (this.readyReject) {
          this.fail(error)
        }
        return
      }
      case 'Z': {
        if (this.readyResolve) {
          this.readyResolve()
          this.readyResolve = null
          this.readyReject = null
          return
        }
        const done = this.queue.shift()
        if (!done) return
        if (done.error) done.reject(done.error)
        else done.resolve(done.rows)
        return
      }
      default:
        return
    }
  }

  query<T = Row>(text: string, params: readonly SqlParam[] = []): Promise<T[]> {
    const run = (): Promise<T[]> =>
      new Promise<Row[]>((resolve, reject) => {
        if (this.closed) {
          reject(new Error('connection closed'))
          return
        }
        this.queue.push({ resolve, reject, fields: [], rows: [], error: null })
        const encoded = params.map(encodeParam)
        const parse = message('P', Buffer.concat([cstring(''), cstring(text), int16(0)]))
        const bindParts: Buffer[] = [cstring(''), cstring(''), int16(0), int16(encoded.length)]
        for (const value of encoded) {
          if (value === null) bindParts.push(int32(-1))
          else bindParts.push(int32(value.length), value)
        }
        bindParts.push(int16(0))
        const bind = message('B', Buffer.concat(bindParts))
        const describe = message('D', Buffer.concat([Buffer.from('P'), cstring('')]))
        const execute = message('E', Buffer.concat([cstring(''), int32(0)]))
        const sync = message('S', Buffer.alloc(0))
        this.socket.write(Buffer.concat([parse, bind, describe, execute, sync]))
      }) as Promise<T[]>
    const result = this.chain.then(run, run)
    this.chain = result.catch(() => undefined)
    return result
  }

  /**
   * Simple-query protocol: one string, any number of statements, no
   * parameters. Used only to apply migration files verbatim.
   */
  simpleQuery(text: string): Promise<Row[]> {
    const run = (): Promise<Row[]> =>
      new Promise<Row[]>((resolve, reject) => {
        this.queue.push({ resolve, reject, fields: [], rows: [], error: null })
        this.socket.write(message('Q', cstring(text)))
      })
    const result = this.chain.then(run, run)
    this.chain = result.catch(() => undefined)
    return result
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.socket.write(message('X', Buffer.alloc(0)))
    this.socket.end()
    this.closed = true
  }
}

/** A tiny connection pool implementing the same `SqlDatabase` the repositories use */
export class PgPool implements SqlDatabase {
  private idle: PgWireClient[] = []
  private all: PgWireClient[] = []
  private waiters: ((client: PgWireClient) => void)[] = []

  constructor(
    private readonly options: PgConnectionOptions,
    private readonly max = 20,
  ) {}

  private async acquire(): Promise<PgWireClient> {
    const idle = this.idle.pop()
    if (idle) return idle
    if (this.all.length < this.max) {
      const client = new PgWireClient(this.options)
      this.all.push(client)
      await client.connect()
      return client
    }
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  private release(client: PgWireClient): void {
    const waiter = this.waiters.shift()
    if (waiter) waiter(client)
    else this.idle.push(client)
  }

  async query<T = Row>(text: string, params?: readonly SqlParam[]): Promise<T[]> {
    const client = await this.acquire()
    try {
      return await client.query<T>(text, params)
    } finally {
      this.release(client)
    }
  }

  async transaction<T>(fn: (tx: Sql) => Promise<T>, options?: { isolation?: IsolationLevel }): Promise<T> {
    const client = await this.acquire()
    try {
      await client.query(`BEGIN ISOLATION LEVEL ${options?.isolation ?? 'READ COMMITTED'}`)
      try {
        const result = await fn(client)
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      }
    } finally {
      this.release(client)
    }
  }

  async end(): Promise<void> {
    await Promise.all(this.all.map((client) => client.close()))
    this.all = []
    this.idle = []
  }
}
