/**
 * The WebSocket endpoint for open apps and the operator console.
 *
 * Protocol (JSON text frames):
 *   client → {type:'auth', token, role:'driver'|'ops'}   first frame, within 5 s
 *   server → {type:'ready', serverTime, audience}         then: fetch a snapshot over HTTP
 *   server → {type:'event', eventId, event, data, at}     dedupe on eventId
 *   client → {type:'ack', offerId}                        driver rendered an offer
 *
 * The token travels in the first FRAME, never in the URL: query strings land
 * in nginx access logs. Authorization is server-side for every connection,
 * and a driver connection is re-validated against its device session every
 * minute (logout / replacement / revoke closes it).
 *
 * Events are hints. On (re)connect the client re-reads the full state, so a
 * missed event costs a little latency, never correctness.
 */
import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer } from 'ws'
import type { RealtimeBus, RealtimeEvent } from './realtime-bus'

export interface GatewayIdentity {
  audience: string
  /** Re-checked periodically; false closes the socket */
  stillValid: () => Promise<boolean>
  onAck?: (offerId: string) => Promise<void>
}

export interface GatewayOptions {
  path: string
  authenticate: (token: string, role: 'driver' | 'ops') => Promise<GatewayIdentity | null>
  authTimeoutMs?: number
  pingIntervalMs?: number
  revalidateIntervalMs?: number
  maxConnections?: number
}

interface Client {
  socket: WebSocket
  identity: GatewayIdentity | null
  alive: boolean
}

export class RealtimeGateway {
  private readonly wss: WebSocketServer
  private readonly clients = new Set<Client>()
  private readonly timers: NodeJS.Timeout[] = []
  private unsubscribe: (() => void) | null = null
  readonly metrics = { connections: 0, authenticated: 0, delivered: 0, authFailures: 0 }

  constructor(
    private readonly server: Server,
    bus: RealtimeBus,
    private readonly options: GatewayOptions,
  ) {
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 4096 })
    server.on('upgrade', this.onUpgrade)
    this.wss.on('connection', (socket) => this.onConnection(socket))
    this.unsubscribe = bus.subscribe((event) => this.deliver(event))
    this.timers.push(
      setInterval(() => this.heartbeat(), options.pingIntervalMs ?? 25_000),
      setInterval(() => void this.revalidate(), options.revalidateIntervalMs ?? 60_000),
    )
  }

  private readonly onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const path = (request.url ?? '').split('?')[0]
    if (path !== this.options.path) return // another upgrade handler may own it
    if (this.clients.size >= (this.options.maxConnections ?? 2000)) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n')
      socket.destroy()
      return
    }
    this.wss.handleUpgrade(request, socket, head, (ws) => this.wss.emit('connection', ws, request))
  }

  private onConnection(socket: WebSocket): void {
    const client: Client = { socket, identity: null, alive: true }
    this.clients.add(client)
    this.metrics.connections++
    const authTimer = setTimeout(() => {
      if (!client.identity) socket.close(4401, 'auth timeout')
    }, this.options.authTimeoutMs ?? 5000)

    socket.on('pong', () => {
      client.alive = true
    })
    socket.on('close', () => {
      clearTimeout(authTimer)
      this.clients.delete(client)
    })
    socket.on('message', async (raw) => {
      let message: { type?: string; token?: string; role?: string; offerId?: string }
      try {
        message = JSON.parse(String(raw))
      } catch {
        return
      }
      if (message.type === 'auth' && !client.identity) {
        const role = message.role === 'ops' ? 'ops' : 'driver'
        const identity = typeof message.token === 'string' ? await this.options.authenticate(message.token, role).catch(() => null) : null
        clearTimeout(authTimer)
        if (!identity) {
          this.metrics.authFailures++
          socket.close(4401, 'unauthorized')
          return
        }
        client.identity = identity
        this.metrics.authenticated++
        socket.send(JSON.stringify({ type: 'ready', serverTime: new Date().toISOString(), audience: identity.audience }))
        return
      }
      if (message.type === 'ack' && client.identity?.onAck && typeof message.offerId === 'string') {
        await client.identity.onAck(message.offerId).catch(() => undefined)
      }
    })
  }

  private deliver(event: RealtimeEvent): void {
    const frame = JSON.stringify({ type: 'event', eventId: event.eventId, event: event.event, data: event.data, at: event.at })
    for (const client of this.clients) {
      if (!client.identity || !event.audiences.includes(client.identity.audience)) continue
      if (client.socket.readyState !== WebSocket.OPEN) continue
      client.socket.send(frame)
      this.metrics.delivered++
    }
  }

  private heartbeat(): void {
    for (const client of this.clients) {
      if (!client.alive) {
        client.socket.terminate()
        continue
      }
      client.alive = false
      client.socket.ping()
    }
  }

  private async revalidate(): Promise<void> {
    for (const client of this.clients) {
      if (!client.identity) continue
      const ok = await client.identity.stillValid().catch(() => false)
      if (!ok) client.socket.close(4401, 'session ended')
    }
  }

  get connectionCount(): number {
    return this.clients.size
  }

  close(): void {
    for (const timer of this.timers) clearInterval(timer)
    this.unsubscribe?.()
    this.server.off('upgrade', this.onUpgrade)
    for (const client of this.clients) client.socket.close(1001, 'server shutting down')
    this.wss.close()
  }
}
