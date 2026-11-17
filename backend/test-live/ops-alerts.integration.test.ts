/**
 * Operator alerts on Telegram and the watchdogs (2026-11-17), against a real
 * Postgres: what reaches Telegram, what does not, once per alert, and one
 * message per incident from the heartbeat watch.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { environmentPrefix, opsAlertText, RecordingOpsChannel, TelegramOpsChannel } from '../src/live-dispatch/notify/ops-telegram'
import { BACKUP_CHECK, beat, checkHeartbeat, HttpWatch, pm2Name, watchDecision, workerCheck } from '../src/live-dispatch/notify/ops-watch'
import { raiseAlert } from '../src/live-dispatch/platform/audit'
import { integrationSkip, offset, useTestDatabase, YEREVAN } from './helpers'
import { createOrder, ctx, drain, eligibleDriver, harness, pendingOffer, startDispatch, type Harness } from './support'

describe('ops alert words (pure)', () => {
  it('names the order, the reason, both prices and links the order page', () => {
    const message = opsAlertText(
      {
        kind: 'DRIVER_CANCELLED_REDISPATCHED',
        data: { reason: 'PRICE_NOT_AGREED', driverPriceAmd: 20000, customerPriceAmd: 12000 },
        orderId: 6,
        orderNumber: 'EV-000006',
        customerPhone: '+37499999999',
        driver: { name: 'Արամ', phone: '+37491111111' },
      },
      'https://evakuators.am',
    )
    assert.ok(message)
    assert.match(message.text, /^EV-000006 · 🔁/)
    assert.match(message.text, /Պատճառ՝ Գինը չի համաձայնեցվել/)
    assert.match(message.text, /վարորդն ասել է՝ 20 000 ֏, հաճախորդը՝ 12 000 ֏/)
    assert.match(message.text, /Վարորդ՝ Արամ · \+37491111111/)
    assert.deepEqual(message.button, { text: 'Բացել պատվերը', url: 'https://evakuators.am/admin/orders/6' })
  })

  it('a released customer cancel says «call the customer» and gives the number', () => {
    const message = opsAlertText(
      { kind: 'DRIVER_CANCEL_REQUEST', data: { reason: 'CUSTOMER_WILL_CALL', released: true }, orderId: 1, orderNumber: 'EV-1', customerPhone: '+37499000000', driver: null },
      'https://evakuators.am',
    )
    assert.match(message!.text, /զանգեք հաճախորդին/)
    assert.match(message!.text, /Հաճախորդ՝ \+37499000000/)
  })

  it('noise does not go to Telegram', () => {
    for (const kind of ['SEARCH_SLOW', 'ACTIVE_GPS_LOST', 'DRIVER_NOT_MOVING']) {
      assert.equal(opsAlertText({ kind, data: {}, orderId: 1, orderNumber: 'EV-1', customerPhone: null, driver: null }, 'https://evakuators.am'), null)
    }
  })

  it('off production every message says where it came from', () => {
    assert.equal(environmentPrefix('https://evakuators.am'), '')
    assert.equal(environmentPrefix('https://staging.evakuators.am'), '[staging.evakuators.am] ')
    assert.equal(environmentPrefix('http://localhost:3002'), '[localhost:3002] ')
  })

  it('watch decisions and pm2 names', () => {
    assert.equal(watchDecision(false, false), 'down')
    assert.equal(watchDecision(false, true), null)
    assert.equal(watchDecision(true, true), 'up')
    assert.equal(watchDecision(true, false), null)
    assert.equal(pm2Name('worker', 'evakuators-backend-staging'), 'evakuators-worker-staging')
    assert.equal(pm2Name('backend', 'evakuators-worker'), 'evakuators-backend')
  })

  it('the API watch needs two failures in a row, then one «down», then one «back»', async () => {
    const channel = new RecordingOpsChannel()
    let up = false
    const fakeFetch = (async () => {
      if (!up) throw new Error('ECONNREFUSED')
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch
    const watch = new HttpWatch('http://x/health', channel, { down: 'DOWN', up: 'UP' }, fakeFetch)
    assert.equal(await watch.check(), null, 'one failure is a reload, not an incident')
    assert.equal(await watch.check(), 'down')
    assert.equal(await watch.check(), null)
    up = true
    assert.equal(await watch.check(), 'up')
    assert.deepEqual(channel.sent.map((m) => m.text), ['DOWN', 'UP'])
  })
})

describe('ops alerts (real Postgres)', { skip: integrationSkip }, () => {
  const dbCtx = useTestDatabase()
  let h: Harness

  async function fresh() {
    await dbCtx.get().pool.query(`TRUNCATE "DispatchOrder", "OrderOffer", "OutboxEvent", "IdempotencyKey", "DispatchSetting", "SystemHeartbeat" CASCADE`)
    await dbCtx.get().pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false`)
    h = await harness(dbCtx.get())
  }

  it('a driver incident reaches Telegram once, with the order and the driver; GPS noise does not', async () => {
    await fresh()
    const d = await eligibleDriver(h, offset(YEREVAN, 400, 0))
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    await h.service.driverAccept(d.driverId, offer!.id, ctx())
    await h.service.driverRequest(d.driverId, order.id, { kind: 'CANCEL', reason: 'CUSTOMER_WILL_CALL' }, ctx({ r: 1 }))
    await h.db.pool.query('BEGIN')
    await raiseAlert({ query: (sql: string, params?: unknown[]) => h.db.pool.query(sql, params as never) } as never, order.id, 'ACTIVE_GPS_LOST', 'gps-noise', {})
    await h.db.pool.query('COMMIT')
    await drain(h)
    await drain(h)
    const texts = h.ops.sent.map((m) => m.text)
    assert.equal(texts.length, 1, JSON.stringify(texts))
    assert.match(texts[0], /զանգեք հաճախորդին/)
    assert.match(texts[0], /Պատճառ՝ Հաճախորդը կզանգի/)
    assert.ok(h.ops.sent[0].button?.url.endsWith(`/admin/orders/${order.id}`))
  })

  it('heartbeat watch: silent while fresh, one «down» when stale, one «back» when it beats again', async () => {
    await fresh()
    const channel = new RecordingOpsChannel()
    const check = workerCheck('evakuators-worker-staging')
    assert.equal(await checkHeartbeat(h.rt.db, channel, check), null, 'never seen + not required → quiet')
    await beat(h.rt.db, 'worker')
    assert.equal(await checkHeartbeat(h.rt.db, channel, check), null)
    await h.db.pool.query(`UPDATE "SystemHeartbeat" SET "at" = now() - interval '5 minutes' WHERE "name" = 'worker'`)
    assert.equal(await checkHeartbeat(h.rt.db, channel, check), 'down')
    assert.equal(await checkHeartbeat(h.rt.db, channel, check), null, 'once per incident')
    await beat(h.rt.db, 'worker')
    assert.equal(await checkHeartbeat(h.rt.db, channel, check), 'up')
    assert.equal(channel.sent.length, 2)
    assert.match(channel.sent[0].text, /pm2 logs evakuators-worker-staging/)
  })

  it('a backup that never ran is reported once', async () => {
    await fresh()
    const channel = new RecordingOpsChannel()
    assert.equal(await checkHeartbeat(h.rt.db, channel, BACKUP_CHECK), 'down')
    assert.equal(await checkHeartbeat(h.rt.db, channel, BACKUP_CHECK), null)
    assert.match(channel.sent[0].text, /երբեք չի ստեղծվել/)
    await beat(h.rt.db, 'backup', { file: 'x.sql.gz' })
    assert.equal(await checkHeartbeat(h.rt.db, channel, BACKUP_CHECK), 'up')
  })

  it('a Telegram outage on the «down» message is retried on the next check, not lost', async () => {
    await fresh()
    let fail = true
    const flaky = { sent: [] as string[], async send(m: { text: string }) { if (fail) throw new Error('telegram down'); this.sent.push(m.text); return 'sent' as const } }
    await h.db.pool.query(`INSERT INTO "SystemHeartbeat" ("name", "at") VALUES ('worker', now() - interval '10 minutes')`)
    await assert.rejects(() => checkHeartbeat(h.rt.db, flaky, workerCheck(undefined)))
    fail = false
    assert.equal(await checkHeartbeat(h.rt.db, flaky, workerCheck(undefined)), 'down')
    assert.equal(flaky.sent.length, 1)
  })

  it('the real channel sends to every linked admin, prefixed off production, and skips without a token', async () => {
    await fresh()
    await h.db.pool.query(`UPDATE "User" SET "telegramChatId" = 555 WHERE "id" = $1::int`, [h.adminId])
    const calls: Array<{ url: string; body: { chat_id: string; text: string } }> = []
    const fakeFetch = (async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) })
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch
    const channel = new TelegramOpsChannel(h.rt.db, { botToken: 'T', frontendUrl: 'https://staging.evakuators.am', fetchImpl: fakeFetch })
    assert.equal(await channel.send({ text: 'hello' }), 'sent')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].body.chat_id, '555')
    assert.equal(calls[0].body.text, '[staging.evakuators.am] hello')
    assert.equal(await new TelegramOpsChannel(h.rt.db, { botToken: '', frontendUrl: 'https://evakuators.am', fetchImpl: fakeFetch }).send({ text: 'x' }), 'skipped')
  })
})
