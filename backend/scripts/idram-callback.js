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
 *   node scripts/idram-callback.js                    # list payments to pick from
 *   node scripts/idram-callback.js 12                 # precheck, then confirm
 *   node scripts/idram-callback.js 12 --precheck      # precheck only
 *   node scripts/idram-callback.js 12 --confirm       # confirmation only
 *   node scripts/idram-callback.js 12 --confirm --amount 1     # tampered amount
 *   node scripts/idram-callback.js 12 --confirm --bad-checksum # forged signature
 *   node scripts/idram-callback.js 12 --replay       # resend the SAME transaction
 *   node scripts/idram-callback.js 12 --confirm --trans-id 999 # a chosen id
 *
 * Expected answers (the body is what Idram reads, never the status):
 *   precheck on a PENDING payment .................. OK
 *   confirmation, everything correct ............... OK      → payment becomes PAID
 *   --replay (the SAME EDP_TRANS_ID) ............... OK      → nothing changes
 *   --confirm again (a NEW id, bill already paid) .. REFUSED → no second transaction
 *   --amount / --bad-checksum / unknown bill ....... REFUSED → payment stays PENDING
 *
 * The middle two are different guards and both matter. `--replay` is the one
 * Idram itself triggers: it retries any callback it did not hear "OK" from, so
 * the same transaction WILL arrive twice, and answering anything but OK would
 * make it keep trying. A new transaction against a bill that is already paid is
 * not a retry — that is someone paying twice, or someone else's message, and it
 * is refused.
 *
 * Development and staging only, and never production: `assertSafeDatabase`
 * requires the environment to declare itself, and the API host must be this
 * machine's own. Its whole purpose is forging a payment provider's signature,
 * which is exactly what it must never be able to do anywhere real.
 *
 * On staging, run it ON the staging server against its own port:
 *   LOCAL_API_URL=http://localhost:4003 node scripts/idram-callback.js
 */
require('dotenv/config')
const { createHash } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { assertSafeDatabase } = require('./assert-safe-environment')

/** Keep in sync with src/idram/idram.constants.ts */
const IDRAM_PRECHECK_YES = 'YES'
/** Keep in sync with app.setGlobalPrefix('api/v1') in src/main.ts and IdramController */
const RESULT_PATH = '/api/v1/idram/result'

function assertSafeTarget(apiUrl) {
  // The database decides whether this environment may be written to at all —
  // see assert-safe-environment.js for why "localhost" alone never proved that.
  assertSafeDatabase('forge payment callbacks')

  // And the API has to be the one on this machine: this script signs messages
  // as the payment provider, so pointing it at a host somewhere else is the
  // one thing it must never do.
  const apiHost = new URL(apiUrl).hostname
  if (apiHost !== 'localhost' && apiHost !== '127.0.0.1') {
    console.error(`Refusing to post a forged callback to a remote API (${apiHost}).`)
    console.error('Run this ON the machine whose backend you are testing, against its localhost port.')
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

/**
 * With no id, print the recent payments instead of guessing at one — the id is
 * `EDP_BILL_NO`, it is minted when a driver presses «Վճարել», and hunting for
 * it in the browser's network tab is the slowest part of testing this.
 */
async function listPayments(prisma) {
  const payments = await prisma.subscriptionPayment.findMany({
    orderBy: { id: 'desc' },
    take: 10,
    include: { towTruck: { select: { driverName: true, phone: true } } },
  })

  if (payments.length === 0) {
    console.log('No SubscriptionPayment rows yet. Sign in as a test driver, open /dashboard and press «Վճարել».')
    return
  }

  console.log('recent payments (newest first) — pass the id as the first argument:\n')
  for (const payment of payments) {
    const driver = `${payment.towTruck.driverName} ${payment.towTruck.phone}`
    console.log(
      `  #${String(payment.id).padEnd(5)} ${payment.status.padEnd(9)} ${String(payment.amount).padStart(6)} ${payment.currency}  ${payment.planCode.padEnd(12)} ${driver}`,
    )
  }
  console.log('\n  node scripts/idram-callback.js <id>')
}

async function main() {
  const apiUrl = (process.env.LOCAL_API_URL ?? 'http://localhost:4002').replace(/\/$/, '')
  assertSafeTarget(apiUrl)

  const paymentId = Number(process.argv[2])
  // No id, or one that is not a positive integer, both mean "I do not know
  // which payment" — so both list. A trailing shell comment counts: zsh does
  // not strip `#` in an interactive shell, so a pasted `... # note` arrives
  // here as argv[2] === '#'. Printing usage at someone who cannot name the id
  // helps less than showing them the ids.
  const listOnly = !Number.isInteger(paymentId) || paymentId <= 0

  const prisma = new PrismaClient()
  try {
    if (listOnly) {
      if (process.argv[2] !== undefined) {
        console.log(`'${process.argv[2]}' is not a payment id.\n`)
      }
      await listPayments(prisma)
      console.log('  flags: --precheck | --confirm | --amount N | --bad-checksum | --trans-id ID')
      return
    }

    const payment = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } })
    if (!payment) {
      console.error(`No SubscriptionPayment with id ${paymentId}. Create one from the dashboard («Վճարել»), then pass the id it shows.`)
      process.exit(1)
    }

    const recAccount = process.env.IDRAM_REC_ACCOUNT ?? ''
    const secretKey = process.env.IDRAM_SECRET_KEY ?? ''
    if (!recAccount || !secretKey) {
      console.error('IDRAM_REC_ACCOUNT and IDRAM_SECRET_KEY must be set in backend/.env — without them the backend refuses every callback by design.')
      process.exit(1)
    }

    // Idram sends the amount with decimals ("3000.00"); ours is an integer.
    // Using their shape here is the point — the backend must compare the
    // NUMBER, not the string (see idramAmountMatches).
    const sentAmount = option('amount', null) ?? `${payment.amount}.00`

    // --replay resends the transaction id already recorded against this
    // payment, which is the only way to exercise the guard that matters most:
    // Idram retries a callback it did not hear "OK" from, so the same
    // EDP_TRANS_ID arrives more than once by design. A fresh id would test a
    // different thing entirely (a second payment for a paid bill).
    if (flag('replay') && !payment.providerTransactionId) {
      console.error(`Payment #${payment.id} has no recorded transaction to replay — confirm it first.`)
      process.exit(1)
    }
    const transId = flag('replay')
      ? payment.providerTransactionId
      : option('trans-id', `LOCAL-${Date.now()}`)
    const transDate = new Date().toISOString().slice(0, 19).replace('T', ' ')

    console.log(`payment #${payment.id} · ${payment.planCode} · ${payment.amount} ${payment.currency} · ${payment.status} · towTruck ${payment.towTruckId}`)
    console.log(`posting to ${apiUrl}${RESULT_PATH}`)

    const only = flag('precheck') || flag('confirm') || flag('replay')

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

    if (!only || flag('confirm') || flag('replay')) {
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

      await post(apiUrl, fields, flag('replay') ? 'replay' : 'confirmation')
      console.log(`  transaction     ${transId}`)

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
