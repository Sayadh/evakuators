/**
 * Plays Idram's server against a **local** backend, so the whole confirmation
 * path can be exercised without a real payment.
 *
 * ## Why this exists
 *
 * The two callbacks are server-to-server: Idram POSTs them to RESULT_URL, and
 * RESULT_URL is a public address (`api.evakuators.am`) that cannot reach a
 * backend on localhost. So the one part of this integration that actually
 * moves money — checksum, replay, amount, confirmation, unlock — is the one
 * part a browser cannot test locally.
 *
 * This script is the other side of that wire. It reads a real PENDING payment
 * out of the local database, builds the exact form Idram would post (including
 * a correct MD5 checksum, secret third — see src/idram/idram-checksum.ts), and
 * posts it to the local RESULT_URL.
 *
 * It is also strictly better than a live test payment for the cases that
 * matter: a tampered amount, a replayed transaction and a bad checksum are all
 * one flag away here, and cannot be produced with Idram's own test account at
 * all.
 *
 * Usage, from backend/ (with the backend running):
 *   node scripts/idram-callback.js 12                 # precheck, then confirm
 *   node scripts/idram-callback.js 12 --precheck      # precheck only
 *   node scripts/idram-callback.js 12 --confirm       # confirmation only
 *   node scripts/idram-callback.js 12 --confirm --amount 1     # tampered amount
 *   node scripts/idram-callback.js 12 --confirm --bad-checksum # forged signature
 *   node scripts/idram-callback.js 12 --confirm --trans-id 999 # replay a used id
 *
 * Expected answers (the body is what Idram reads, never the status):
 *   precheck on a PENDING payment .................. OK
 *   confirmation, everything correct ............... OK      → payment becomes PAID
 *   the same confirmation again .................... OK      → idempotent, no second period
 *   --amount / --bad-checksum / unknown bill ....... REFUSED → payment stays PENDING
 *
 * Local only, for the same reasons as create-test-driver.js: it refuses
 * NODE_ENV=production, a non-local database and a non-local API host. Its
 * whole purpose is forging a payment provider's signature, which is exactly
 * what it must never be able to do anywhere real.
 */
require('dotenv/config')
const { createHash } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')

/** Keep in sync with src/idram/idram.constants.ts */
const IDRAM_PRECHECK_YES = 'YES'
/** Keep in sync with app.setGlobalPrefix('api/v1') in src/main.ts and IdramController */
const RESULT_PATH = '/api/v1/idram/result'

function assertLocalOnly(apiUrl) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run with NODE_ENV=production. This script forges provider signatures.')
    process.exit(1)
  }
  const dbHost = new URL(process.env.DATABASE_URL ?? 'postgres://x@localhost/x').hostname
  if (dbHost !== 'localhost' && dbHost !== '127.0.0.1') {
    console.error(`Refusing to run against a non-local database (${dbHost}).`)
    process.exit(1)
  }
  const apiHost = new URL(apiUrl).hostname
  if (apiHost !== 'localhost' && apiHost !== '127.0.0.1') {
    console.error(`Refusing to post to a non-local API (${apiHost}).`)
    process.exit(1)
  }
}

/**
 * MD5 over the seven values joined by ':' with the secret THIRD — the same
 * string src/idram/idram-checksum.ts builds. Deliberately re-implemented here
 * rather than imported: the backend's copy is TypeScript, and a checksum an
 * independent implementation agrees on is a real test of the format, while one
 * that shares code with what it verifies tests nothing.
 */
function buildChecksum(fields, secretKey) {
  return createHash('md5')
    .update(
      [
        fields.EDP_REC_ACCOUNT,
        fields.EDP_AMOUNT,
        secretKey,
        fields.EDP_BILL_NO,
        fields.EDP_PAYER_ACCOUNT,
        fields.EDP_TRANS_ID,
        fields.EDP_TRANS_DATE,
      ].join(':'),
      'utf8',
    )
    .digest('hex')
}

async function post(apiUrl, fields, label) {
  const response = await fetch(`${apiUrl}${RESULT_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  })
  const body = (await response.text()).trim()
  const verdict = body === 'OK' ? 'OK' : `${body || '(empty)'}`
  console.log(`  ${label.padEnd(14)} → ${response.status} ${verdict}`)
  return body === 'OK'
}

function flag(name) {
  return process.argv.includes(`--${name}`)
}

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

async function main() {
  const paymentId = Number(process.argv[2])
  const apiUrl = (process.env.LOCAL_API_URL ?? 'http://localhost:4002').replace(/\/$/, '')

  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    console.error('Usage: node scripts/idram-callback.js <paymentId> [--precheck|--confirm] [--amount N] [--bad-checksum] [--trans-id ID]')
    process.exit(1)
  }
  assertLocalOnly(apiUrl)

  const recAccount = process.env.IDRAM_REC_ACCOUNT ?? ''
  const secretKey = process.env.IDRAM_SECRET_KEY ?? ''
  if (!recAccount || !secretKey) {
    console.error('IDRAM_REC_ACCOUNT and IDRAM_SECRET_KEY must be set in backend/.env — without them the backend refuses every callback by design.')
    process.exit(1)
  }

  const prisma = new PrismaClient()
  try {
    const payment = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } })
    if (!payment) {
      console.error(`No SubscriptionPayment with id ${paymentId}. Create one from the dashboard («Վճարել»), then pass the id it shows.`)
      process.exit(1)
    }

    // Idram sends the amount with decimals ("3000.00"); ours is an integer.
    // Using their shape here is the point — the backend must compare the
    // NUMBER, not the string (see idramAmountMatches).
    const sentAmount = option('amount', null) ?? `${payment.amount}.00`
    const transId = option('trans-id', `LOCAL-${Date.now()}`)
    const transDate = new Date().toISOString().slice(0, 19).replace('T', ' ')

    console.log(`payment #${payment.id} · ${payment.planCode} · ${payment.amount} ${payment.currency} · ${payment.status} · towTruck ${payment.towTruckId}`)
    console.log(`posting to ${apiUrl}${RESULT_PATH}`)

    const only = flag('precheck') || flag('confirm')

    if (!only || flag('precheck')) {
      await post(
        apiUrl,
        {
          EDP_PRECHECK: IDRAM_PRECHECK_YES,
          EDP_BILL_NO: String(payment.id),
          EDP_REC_ACCOUNT: recAccount,
          EDP_AMOUNT: sentAmount,
        },
        'precheck',
      )
    }

    if (!only || flag('confirm')) {
      const fields = {
        EDP_BILL_NO: String(payment.id),
        EDP_REC_ACCOUNT: recAccount,
        EDP_AMOUNT: sentAmount,
        EDP_PAYER_ACCOUNT: '99999999',
        EDP_TRANS_ID: transId,
        EDP_TRANS_DATE: transDate,
      }
      fields.EDP_CHECKSUM = flag('bad-checksum')
        ? '0'.repeat(32)
        : buildChecksum(fields, secretKey)

      await post(apiUrl, fields, 'confirmation')

      const after = await prisma.subscriptionPayment.findUnique({ where: { id: payment.id } })
      console.log(`  payment is now ${after.status}${after.periodEnd ? ` · covered until ${after.periodEnd.toISOString().slice(0, 10)}` : ''}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
