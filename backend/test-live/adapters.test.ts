/**
 * Provider adapters against fake HTTP (no network, no keys, no cost), the
 * routing guard against a real Postgres budget table, and the Redis client
 * against a real redis-server when LIVE_DISPATCH_TEST_REDIS_URL is set.
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync, createVerify } from 'node:crypto'
import { describe, it } from 'node:test'
import { FcmSender, signServiceAccountJwt } from '../src/live-dispatch/notify/fcm'
import { RedisBus } from '../src/live-dispatch/notify/realtime-bus'
import { parseRedisUrl, RedisPublisher, RedisSubscriber } from '../src/live-dispatch/notify/redis-resp'
import { rankCandidates } from '../src/live-dispatch/dispatching/domain/ranking'
import { FakeRoutingProvider, GoogleRoutesProvider, OrsProvider, parseGoogleDuration } from '../src/live-dispatch/routing/providers'
import { GuardedRouting, ProviderHttpError, type RoutingProvider } from '../src/live-dispatch/routing/routing-provider'
import { integrationSkip, useTestDatabase, YEREVAN } from './helpers'

type FetchCall = { url: string; init: RequestInit }

function fakeFetch(handler: (call: FetchCall) => { status: number; json: unknown }): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const impl = (async (url: string | URL, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} }
    calls.push(call)
    const { status, json } = handler(call)
    return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  return { fetch: impl, calls }
}

describe('Google Routes adapter', () => {
  it('sends the documented request: endpoint, key header, field mask with status, lat/lng waypoints, DRIVE', async () => {
    const { fetch, calls } = fakeFetch(() => ({
      status: 200,
      json: [
        // proto3 JSON omits zero: this element has NO originIndex — it is origin 0
        { status: {}, condition: 'ROUTE_EXISTS', distanceMeters: 4100, duration: '420s' },
        { originIndex: 1, status: {}, condition: 'ROUTE_NOT_FOUND' },
        { originIndex: 2, status: { code: 3, message: 'bad' } },
      ],
    }))
    const provider = new GoogleRoutesProvider('server-key', 'TRAFFIC_AWARE', fetch)
    const result = await provider.matrix([YEREVAN, YEREVAN, YEREVAN], { latitude: 40.2, longitude: 44.5 }, new AbortController().signal)
    assert.equal(calls[0].url, 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix')
    const headers = calls[0].init.headers as Record<string, string>
    assert.equal(headers['X-Goog-Api-Key'], 'server-key')
    assert.match(headers['X-Goog-FieldMask'], /status/)
    const body = JSON.parse(String(calls[0].init.body))
    assert.equal(body.travelMode, 'DRIVE')
    assert.deepEqual(body.destinations[0].waypoint.location.latLng, { latitude: 40.2, longitude: 44.5 })
    assert.deepEqual(result.entries, [
      { ok: true, meters: 4100, seconds: 420 },
      { ok: false, error: 'NO_ROUTE' },
      { ok: false, error: 'ELEMENT_ERROR' },
    ])
    assert.equal(result.billableElements, 3)
  })

  it('an element missing from the response is a per-pair failure, not a crash', async () => {
    const { fetch } = fakeFetch(() => ({ status: 200, json: [{ originIndex: 1, condition: 'ROUTE_EXISTS', distanceMeters: 10, duration: '5s' }] }))
    const result = await new GoogleRoutesProvider('k', 'TRAFFIC_AWARE', fetch).matrix([YEREVAN, YEREVAN], YEREVAN, new AbortController().signal)
    assert.deepEqual(result.entries, [{ ok: false, error: 'ELEMENT_ERROR' }, { ok: true, meters: 10, seconds: 5 }])
  })

  it('HTTP errors: 429/5xx retryable, 4xx not', async () => {
    for (const [status, retryable] of [[429, true], [503, true], [400, false], [403, false]] as const) {
      const { fetch } = fakeFetch(() => ({ status, json: {} }))
      await assert.rejects(
        new GoogleRoutesProvider('k', 'TRAFFIC_AWARE', fetch).matrix([YEREVAN], YEREVAN, new AbortController().signal),
        (e: ProviderHttpError) => e.status === status && e.retryable === retryable,
      )
    }
  })

  it('duration parsing', () => {
    assert.equal(parseGoogleDuration('3.5s'), 3.5)
    assert.equal(parseGoogleDuration('0s'), 0)
    assert.equal(parseGoogleDuration('12m'), null)
    assert.equal(parseGoogleDuration(undefined), null)
  })
})

describe('OpenRouteService adapter', () => {
  it('longitude first; null cells become NO_ROUTE', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, json: { distances: [[1000], [null]], durations: [[100], [null]] } }))
    const result = await new OrsProvider('ors-key', 'https://ors.test', fetch).matrix([YEREVAN, YEREVAN], { latitude: 40.3, longitude: 44.6 }, new AbortController().signal)
    const body = JSON.parse(String(calls[0].init.body))
    assert.deepEqual(body.locations[2], [44.6, 40.3])
    assert.deepEqual(result.entries, [{ ok: true, meters: 1000, seconds: 100 }, { ok: false, error: 'NO_ROUTE' }])
  })
})

describe('ranking', () => {
  const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s))
  it('ETA first; near-equal ETAs go to whoever has waited longest; unrouted last; total and stable', () => {
    const ranked = rankCandidates(
      [
        { driverId: 1, straightLineMeters: 900, route: { ok: true, meters: 2000, seconds: 300 }, availableSince: at(50) },
        { driverId: 2, straightLineMeters: 800, route: { ok: true, meters: 2100, seconds: 330 }, availableSince: at(10) },
        { driverId: 3, straightLineMeters: 100, route: { ok: false, error: 'NO_ROUTE' }, availableSince: at(0) },
        { driverId: 4, straightLineMeters: 3000, route: { ok: true, meters: 9000, seconds: 900 }, availableSince: at(0) },
      ],
      60,
    )
    assert.deepEqual(ranked.map((c) => c.driverId), [2, 1, 4, 3])
  })

  it('is a valid total order over random inputs (sorting twice gives the same result)', () => {
    for (let trial = 0; trial < 200; trial++) {
      const input = Array.from({ length: 12 }, (_, i) => ({
        driverId: i,
        straightLineMeters: Math.floor(Math.random() * 5000),
        route: Math.random() < 0.2 ? ({ ok: false, error: 'NO_ROUTE' } as const) : ({ ok: true, meters: 1, seconds: Math.floor(Math.random() * 900) } as const),
        availableSince: Math.random() < 0.3 ? null : at(Math.floor(Math.random() * 60)),
      }))
      const a = rankCandidates(input, 60).map((c) => c.driverId)
      const b = rankCandidates([...input].reverse(), 60).map((c) => c.driverId)
      assert.deepEqual(a, b)
    }
  })
})

describe('FCM HTTP v1 sender', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const account = {
    project_id: 'evakuators-test',
    client_email: 'push@evakuators-test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }

  it('signs a verifiable RS256 service-account assertion with the messaging scope', () => {
    const jwt = signServiceAccountJwt(account, 1_800_000_000)
    const [header, claims, signature] = jwt.split('.')
    const verifier = createVerify('RSA-SHA256')
    verifier.update(`${header}.${claims}`)
    assert.ok(verifier.verify(publicKey, Buffer.from(signature, 'base64url')))
    const decoded = JSON.parse(Buffer.from(claims, 'base64url').toString())
    assert.equal(decoded.scope, 'https://www.googleapis.com/auth/firebase.messaging')
    assert.equal(decoded.exp - decoded.iat, 3600)
  })

  it('sends TTL from the offer deadline, caches the token, and classifies UNREGISTERED as an invalid token', async () => {
    let sends = 0
    const { fetch, calls } = fakeFetch((call) => {
      if (call.url.includes('oauth2')) return { status: 200, json: { access_token: 'at-1', expires_in: 3600 } }
      sends++
      if (sends === 2) return { status: 404, json: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } } }
      return { status: 200, json: { name: 'projects/p/messages/1' } }
    })
    const sender = new FcmSender(account, fetch)
    const message = { token: 't', title: 'Նոր պատվեր', body: 'x', data: { type: 'offer' }, ttlSeconds: 27.4, collapseKey: 'offer-1', highPriority: true }
    assert.deepEqual(await sender.send(message), { ok: true, messageId: 'projects/p/messages/1' })
    const second = await sender.send(message)
    assert.deepEqual(second, { ok: false, invalidToken: true, retryable: false, error: 'UNREGISTERED' })
    assert.equal(calls.filter((c) => c.url.includes('oauth2')).length, 1, 'token cached')
    const sent = JSON.parse(String(calls[1].init.body)).message
    assert.equal(sent.android.ttl, '27s')
    assert.equal(sent.android.priority, 'HIGH')
    assert.equal(sent.apns.headers['apns-priority'], '10')
    assert.ok(Number(sent.apns.headers['apns-expiration']) <= Math.floor(Date.now() / 1000) + 28)
  })

  it('5xx and network failures are retryable, never "invalid token"', async () => {
    const { fetch } = fakeFetch((call) =>
      call.url.includes('oauth2') ? { status: 200, json: { access_token: 'a', expires_in: 3600 } } : { status: 503, json: {} },
    )
    const result = await new FcmSender(account, fetch).send({ token: 't', title: 'a', body: 'b', data: {}, ttlSeconds: 5, collapseKey: 'c', highPriority: false })
    assert.deepEqual(result, { ok: false, invalidToken: false, retryable: true, error: 'HTTP_503' })
  })
})

describe('routing guard (real Postgres budget)', { skip: integrationSkip }, () => {
  const dbCtx = useTestDatabase()

  it('counts ELEMENTS against a daily budget stored in the database', async () => {
    const provider = new FakeRoutingProvider()
    const guard = new GuardedRouting(provider, dbCtx.get().pool, { timeoutMs: 1000, retries: 0, baseBackoffMs: 1, maxConcurrent: 2, dailyElementBudget: () => 10 })
    const six = Array.from({ length: 6 }, () => YEREVAN)
    assert.ok((await guard.matrix(six, YEREVAN)).entries.every((e) => e.ok))
    const refused = await guard.matrix(six, YEREVAN)
    assert.ok(refused.entries.every((e) => !e.ok && e.error === 'BUDGET_EXHAUSTED'))
    assert.equal(provider.calls, 1, 'the provider was not called past the budget')
    const [{ elements }] = await dbCtx.get().pool.query<{ elements: number }>(`SELECT "elements" FROM "RoutingUsageDay" WHERE "provider" = 'fake'`)
    assert.equal(elements, 6)
    // a fresh guard (= a restarted process) sees the same budget
    const restarted = new GuardedRouting(provider, dbCtx.get().pool, { timeoutMs: 1000, retries: 0, baseBackoffMs: 1, maxConcurrent: 2, dailyElementBudget: () => 10 })
    assert.ok((await restarted.matrix(six, YEREVAN)).entries.every((e) => !e.ok))
  })

  it('timeout with bounded retry, then every pair fails with TIMEOUT (no straight line passed off as a road)', async () => {
    await dbCtx.get().pool.query(`DELETE FROM "RoutingUsageDay"`)
    const slow = new FakeRoutingProvider({ latencyMs: 300 })
    const guard = new GuardedRouting(slow, dbCtx.get().pool, { timeoutMs: 50, retries: 2, baseBackoffMs: 5, maxConcurrent: 2, dailyElementBudget: () => 1000 })
    const started = Date.now()
    const result = await guard.matrix([YEREVAN, YEREVAN], YEREVAN)
    assert.ok(result.entries.every((e) => !e.ok && e.error === 'TIMEOUT'))
    assert.equal(slow.calls, 3, '1 try + 2 retries')
    assert.ok(Date.now() - started < 1000)
  })

  it('caps concurrent provider calls', async () => {
    await dbCtx.get().pool.query(`DELETE FROM "RoutingUsageDay"`)
    let inFlight = 0
    let peak = 0
    const tracking: RoutingProvider = {
      name: 'tracking',
      maxElementsPerRequest: 25,
      async matrix(origins) {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise((r) => setTimeout(r, 20))
        inFlight--
        return { provider: 'tracking', computedAt: new Date(), entries: origins.map(() => ({ ok: true as const, meters: 1, seconds: 1 })), billableElements: origins.length }
      },
    }
    const guard = new GuardedRouting(tracking, dbCtx.get().pool, { timeoutMs: 1000, retries: 0, baseBackoffMs: 1, maxConcurrent: 3, dailyElementBudget: () => 1000 })
    await Promise.all(Array.from({ length: 12 }, () => guard.matrix([YEREVAN], YEREVAN)))
    assert.equal(peak, 3)
  })
})

const redisUrl = process.env.LIVE_DISPATCH_TEST_REDIS_URL
describe('Redis pub/sub (real redis-server)', { skip: redisUrl ? false : 'LIVE_DISPATCH_TEST_REDIS_URL not set' }, () => {
  it('publish → subscriber, including UTF-8 Armenian payloads', async () => {
    const options = parseRedisUrl(redisUrl!)
    const received: string[] = []
    const subscriber = new RedisSubscriber(options, 'ld-test', (m) => received.push(m))
    await subscriber.start()
    const publisher = new RedisPublisher(options)
    const listeners = await publisher.publish('ld-test', JSON.stringify({ text: 'Նոր պատվեր' }))
    assert.equal(listeners, 1)
    await new Promise((r) => setTimeout(r, 50))
    assert.deepEqual(received.map((m) => JSON.parse(m).text), ['Նոր պատվեր'])
    subscriber.stop()
    publisher.close()
  })

  it('RedisBus delivers events between two independent bus instances (worker → API)', async () => {
    const options = parseRedisUrl(redisUrl!)
    const api = new RedisBus(options)
    const worker = new RedisBus(options)
    const got: string[] = []
    api.subscribe((e) => got.push(e.eventId))
    await new Promise((r) => setTimeout(r, 100))
    await worker.publish({ eventId: 'e1', audiences: ['admin'], event: 'order.changed', data: {}, at: new Date().toISOString() })
    await new Promise((r) => setTimeout(r, 50))
    assert.deepEqual(got, ['e1'])
    api.close()
    worker.close()
  })

  it('subscriber reconnects after the server drops it (Redis restart)', async () => {
    const options = parseRedisUrl(redisUrl!)
    const received: string[] = []
    const subscriber = new RedisSubscriber(options, 'ld-test-2', (m) => received.push(m))
    await subscriber.start()
    const admin = new RedisPublisher(options)
    // Kill every pub/sub client connection, as a Redis restart would
    const killer = new RedisPublisher(options)
    await (killer as unknown as { conn(): Promise<{ command(a: string[]): Promise<unknown> }> }).conn().then((c) => c.command(['CLIENT', 'KILL', 'TYPE', 'pubsub']))
    await new Promise((r) => setTimeout(r, 800))
    assert.equal(subscriber.connected, true)
    await admin.publish('ld-test-2', 'after-restart')
    await new Promise((r) => setTimeout(r, 50))
    assert.deepEqual(received, ['after-restart'])
    subscriber.stop()
    admin.close()
    killer.close()
  })
})
