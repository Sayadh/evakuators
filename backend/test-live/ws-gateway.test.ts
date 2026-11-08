/**
 * The WebSocket gateway against a real `ws` server on a real HTTP server,
 * with Node's built-in WebSocket client.
 */
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import { InProcessBus } from '../src/live-dispatch/notify/realtime-bus'
import { RealtimeGateway } from '../src/live-dispatch/notify/ws-gateway'

describe('realtime WebSocket gateway (real ws server)', () => {
  let server: Server
  let gateway: RealtimeGateway
  let url: string
  const bus = new InProcessBus()
  const acks: string[] = []
  let driver7Valid = true

  before(async () => {
    server = createServer((_, res) => res.end('ok'))
    gateway = new RealtimeGateway(server, bus, {
      path: '/api/v1/realtime',
      authTimeoutMs: 300,
      revalidateIntervalMs: 100,
      authenticate: async (token, role) => {
        if (role === 'driver' && token === 'driver-7') {
          return { audience: 'driver:7', stillValid: async () => driver7Valid, onAck: async (offerId) => void acks.push(offerId) }
        }
        if (role === 'driver' && token === 'driver-8') return { audience: 'driver:8', stillValid: async () => true }
        if (role === 'ops' && token === 'ops') return { audience: 'admin', stillValid: async () => true }
        return null
      },
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/realtime`
  })

  after(() => {
    gateway.close()
    server.close()
  })

  function connect(token: string, role: 'driver' | 'ops') {
    const socket = new WebSocket(url)
    const messages: Record<string, unknown>[] = []
    const closed = new Promise<number>((resolve) => socket.addEventListener('close', (e) => resolve(e.code)))
    const ready = new Promise<void>((resolve, reject) => {
      socket.addEventListener('message', (e) => {
        const m = JSON.parse(String(e.data))
        messages.push(m)
        if (m.type === 'ready') resolve()
      })
      socket.addEventListener('close', () => reject(new Error('closed')))
    })
    socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'auth', token, role })))
    // Tests that expect a refusal await `closed`, not `ready`.
    ready.catch(() => undefined)
    return { socket, messages, ready, closed }
  }

  it('authenticates in the first frame and routes events ONLY to their audience', async () => {
    const d7 = connect('driver-7', 'driver')
    const d8 = connect('driver-8', 'driver')
    const ops = connect('ops', 'ops')
    await Promise.all([d7.ready, d8.ready, ops.ready])
    await bus.publish({ eventId: 'e1', audiences: ['driver:7', 'admin'], event: 'offer.new', data: { offerId: 'o1' }, at: 'now' })
    await new Promise((r) => setTimeout(r, 50))
    assert.deepEqual(d7.messages.filter((m) => m.type === 'event').map((m) => m.eventId), ['e1'])
    assert.deepEqual(ops.messages.filter((m) => m.type === 'event').map((m) => m.eventId), ['e1'])
    assert.equal(d8.messages.filter((m) => m.type === 'event').length, 0, 'driver 8 never sees driver 7 events')
    d8.socket.close()
    ops.socket.close()
  })

  it('a bad token or no auth frame is closed with 4401', async () => {
    const bad = connect('forged', 'ops')
    assert.equal(await bad.closed, 4401)
    const silent = new WebSocket(url)
    const code = await new Promise<number>((resolve) => silent.addEventListener('close', (e) => resolve(e.code)))
    assert.equal(code, 4401)
  })

  it('a driver role token cannot listen as ops', async () => {
    const sneaky = connect('driver-7', 'ops')
    assert.equal(await sneaky.closed, 4401)
  })

  it('acks reach the handler; a revoked session is disconnected', async () => {
    const d7 = connect('driver-7', 'driver')
    await d7.ready
    d7.socket.send(JSON.stringify({ type: 'ack', offerId: 'o-42' }))
    await new Promise((r) => setTimeout(r, 50))
    assert.deepEqual(acks.slice(-1), ['o-42'])
    driver7Valid = false
    assert.equal(await d7.closed, 4401)
    driver7Valid = true
  })
})
