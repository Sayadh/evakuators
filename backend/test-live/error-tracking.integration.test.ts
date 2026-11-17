/**
 * In-house error tracking (2026-11-17) against a real Postgres: grouping,
 * counting, reopening, the public-endpoint cap, scrubbing and the Telegram budget.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fingerprint, MAX_OPEN_GROUPS, recordError, resetErrorTelegramBudget, scrub } from '../src/error-tracking/error-store'
import { RecordingOpsChannel } from '../src/live-dispatch/notify/ops-telegram'
import { integrationSkip, useTestDatabase } from './helpers'

describe('error fingerprints (pure)', () => {
  it('the same problem with other ids is one group; another source or place is another', () => {
    const stack = 'Error: x\n    at OrdersRepository.lockOrder (/app/dist/orders.js:10:5)'
    const a = fingerprint({ source: 'api', message: 'Order 17 not found', stack })
    assert.equal(a, fingerprint({ source: 'api', message: 'Order 18 not found', stack: stack.replace(':10:5', ':11:9') }))
    assert.notEqual(a, fingerprint({ source: 'worker', message: 'Order 17 not found', stack }))
    assert.notEqual(a, fingerprint({ source: 'api', message: 'Order 17 not found', stack: 'Error\n    at Other.place (/app/x.js:1:1)' }))
  })

  it('phone numbers never reach the store', () => {
    assert.equal(scrub('driver +374 91 23 45 67 failed, alt 091234567'), 'driver +374… failed, alt 0…')
  })
})

describe('error tracking (real Postgres)', { skip: integrationSkip }, () => {
  const dbCtx = useTestDatabase()
  const db = () => dbCtx.get().pool

  async function fresh() {
    await db().query(`TRUNCATE "ErrorGroup"`)
    resetErrorTelegramBudget()
  }

  it('groups and counts; a new group is reported once; «resolved» then again → reopened and reported again', async () => {
    await fresh()
    const ops = new RecordingOpsChannel()
    const report = { source: 'mobile' as const, message: 'TypeError: undefined is not an object (offer 41)', stack: 'at OfferScreen (index.bundle:1:2)' }
    assert.equal(await recordError(db(), report, { ops, frontendUrl: 'https://evakuators.am' }), 'new')
    assert.equal(await recordError(db(), { ...report, message: report.message.replace('41', '42') }, { ops }), 'repeat')
    const [row] = await db().query<{ id: number; count: number }>(`SELECT "id", "count" FROM "ErrorGroup"`)
    assert.equal(row.count, 2)
    assert.equal(ops.sent.length, 1)
    assert.match(ops.sent[0].text, /Նոր սխալ · Վարորդի հավելված/)
    assert.equal(ops.sent[0].button?.url, 'https://evakuators.am/admin/orders/errors')

    await db().query(`UPDATE "ErrorGroup" SET "resolvedAt" = now()`)
    assert.equal(await recordError(db(), report, { ops }), 'new')
    assert.match(ops.sent[1].text, /կրկնվեց/)
    const [again] = await db().query<{ resolvedAt: unknown; count: number }>(`SELECT "resolvedAt", "count" FROM "ErrorGroup"`)
    assert.equal(again.resolvedAt, null)
    assert.equal(again.count, 3)
  })

  it('a storm of different errors: at most 10 Telegram messages an hour', async () => {
    await fresh()
    const ops = new RecordingOpsChannel()
    for (let i = 0; i < 15; i++) await recordError(db(), { source: 'api', message: `boom`, stack: `at place${String.fromCharCode(97 + i)} (x.js:1:1)` }, { ops, now: 1_000 })
    assert.equal(ops.sent.length, 10)
    assert.equal((await db().query(`SELECT 1 FROM "ErrorGroup"`)).length, 15, 'all recorded, only the messages are capped')
  })

  it('past the open-group cap a NEW kind of THAT source is dropped; an existing one still counts; other sources keep their room', async () => {
    await fresh()
    // A flood through the public endpoint: as many fake 'admin' groups as allowed
    await db().query(
      `INSERT INTO "ErrorGroup" ("fingerprint", "source", "message") SELECT 'f' || g, 'admin', 'x' FROM generate_series(1, ${MAX_OPEN_GROUPS}) g`,
    )
    assert.equal(await recordError(db(), { source: 'admin', message: 'brand new' }), 'dropped')
    assert.equal(await recordError(db(), { source: 'api', message: 'a real backend bug' }), 'new', 'the flood cannot crowd out the backend')
    await db().query(`UPDATE "ErrorGroup" SET "fingerprint" = $1 WHERE "fingerprint" = 'f1'`, [fingerprint({ source: 'admin', message: 'old one' })])
    assert.equal(await recordError(db(), { source: 'admin', message: 'old one' }), 'repeat')
  })

  it('a public report cannot put a link in the admins\' Telegram; the stored text is kept', async () => {
    await fresh()
    const ops = new RecordingOpsChannel()
    await recordError(db(), { source: 'mobile', message: 'Crash! Pay here https://evil.example/x and t.me/scam or @scammer_bot www.bad.am' }, { ops, now: 5_000_000 })
    assert.equal(ops.sent.length, 1)
    assert.doesNotMatch(ops.sent[0].text, /evil\.example|t\.me|@scammer|www\.bad/)
    assert.match(ops.sent[0].text, /‹link›/)
    const [row] = await db().query<{ message: string }>(`SELECT "message" FROM "ErrorGroup"`)
    assert.match(row.message, /evil\.example/)
  })

  it('never throws, even when the database refuses', async () => {
    const broken = { query: async () => { throw new Error('db down') } }
    assert.equal(await recordError(broken as never, { source: 'api', message: 'x' }), 'dropped')
  })
})
