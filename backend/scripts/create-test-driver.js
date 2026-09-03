/**
 * One-off CLI to create (or re-password) a **local test driver**, optionally
 * putting their subscription into a chosen state, so every branch of the
 * driver dashboard can be opened without Telegram and without waiting a month.
 *
 * ## Why this exists
 *
 * A real driver's password is minted in exactly one place — the Telegram
 * `/start` handler (see docs/auth-and-security.md § "Where a driver's password
 * comes from") — and Telegram's webhook is global, so it does not reach a
 * local backend at all (docs/local-development.md § "Telegram login/link
 * flow"). The consequence is that the normal path (register → admin approves →
 * driver taps their link) leaves a local truck with `passwordHash: null`,
 * which cannot log in. There was no way to reach `/dashboard` locally.
 *
 * This does NOT weaken that design: it is a script, it needs `DATABASE_URL`,
 * and it refuses to run against anything but a local database (below). The
 * security boundary that matters is the API, where there is still exactly one
 * password-minting path.
 *
 * Usage, from backend/:
 *   node scripts/create-test-driver.js +37491000001 'test-password'
 *   node scripts/create-test-driver.js +37491000002 'test-password' paid
 *   node scripts/create-test-driver.js +37491000003 'test-password' due-soon
 *   node scripts/create-test-driver.js +37491000004 'test-password' overdue
 *
 * States (what each one is for):
 *   unpaid    no payment rows at all — a driver nobody ever billed. Must NOT
 *             be locked out; this is the deploy-day case (see isLockedOut).
 *   paid      covered for another 25 days — the ordinary dashboard.
 *   due-soon  3 days left — the reminder dialog fires on every visit.
 *   overdue   lapsed 2 days ago — the dashboard is replaced by the payment
 *             block, and the API refuses this driver's writes with 402.
 *   off-unpaid   deactivated for non-payment. Can still sign in; the dashboard
 *                says the page is off the site and offers the payment block.
 *   off-other    deactivated for any other reason. Sign-in is refused, and the
 *                login page shows the contact number instead.
 *
 * Re-running it on the same phone resets that driver's password AND replaces
 * their payment rows, so a truck can be moved between states freely.
 */
require('dotenv/config')
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')

/** Keep in sync with BCRYPT_ROUNDS in src/driver-auth/driver-password.ts (and with create-admin-user.js) */
const BCRYPT_ROUNDS = 12
/** Keep in sync with ARMENIAN_PHONE_PATTERN in src/common/phone.ts — the login key's canonical shape */
const PHONE_PATTERN = /^\+374\d{8}$/
/** Keep in sync with PASSWORD_MIN/MAX_LENGTH in src/driver-auth/driver-password.ts */
const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 72

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Days of coverage each state ends with, relative to now. Chosen against the
 * real threshold rather than round numbers: PAYMENT_DUE_SOON_WITHIN_DAYS is 5
 * (src/subscriptions/subscription-status.ts), so 25 is comfortably outside the
 * warning window and 3 is unambiguously inside it.
 */
const STATE_COVERAGE_DAYS = {
  unpaid: null,
  paid: 25,
  'due-soon': 3,
  overdue: -2,
  'off-unpaid': -2,
  'off-other': -2,
}

/** The two states that also take the driver off the site, and why — see DeactivationReason */
const STATE_DEACTIVATION = {
  'off-unpaid': 'UNPAID',
  'off-other': 'OTHER',
}

function databaseLabel() {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '')
    return `${url.hostname}:${url.port || 5432}${url.pathname}`
  } catch {
    return '(unparseable DATABASE_URL)'
  }
}

function assertNotProduction() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run with NODE_ENV=production. This script is for local development only.')
    process.exit(1)
  }
  const host = new URL(process.env.DATABASE_URL ?? 'postgres://x@localhost/x').hostname
  if (host !== 'localhost' && host !== '127.0.0.1') {
    console.error(
      `Refusing to run against a non-local database (${host}). Real drivers get their password from Telegram — ` +
        'see docs/auth-and-security.md.',
    )
    process.exit(1)
  }
}

/**
 * Replaces this driver's payment history with one row that produces the asked
 * for state — replaces, not adds, because coverage is MAX(periodEnd) over PAID
 * rows: leaving an older, longer row in place would keep a driver "paid" no
 * matter which state was requested afterwards.
 */
async function applyState(prisma, towTruckId, state) {
  await prisma.subscriptionPayment.deleteMany({ where: { towTruckId } })

  const days = STATE_COVERAGE_DAYS[state]
  if (days === null) return null

  const periodEnd = new Date(Date.now() + days * DAY_MS)
  const periodStart = new Date(periodEnd.getTime() - 30 * DAY_MS)

  await prisma.subscriptionPayment.create({
    data: {
      towTruckId,
      planCode: 'ONE_MONTH',
      amount: 3000,
      currency: 'AMD',
      durationMonths: 1,
      periodStart,
      periodEnd,
      status: 'PAID',
    },
  })
  return periodEnd
}

async function main() {
  const [phone, password, state = 'unpaid'] = process.argv.slice(2)

  if (!phone || !password) {
    console.error("Usage: node scripts/create-test-driver.js <+374XXXXXXXX> '<password>' [state]")
    console.error(`States: ${Object.keys(STATE_COVERAGE_DAYS).join(', ')}`)
    process.exit(1)
  }
  if (!PHONE_PATTERN.test(phone)) {
    console.error(`Phone must look like +37491000001 (got "${phone}")`)
    process.exit(1)
  }
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    console.error(`Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`)
    process.exit(1)
  }
  if (!(state in STATE_COVERAGE_DAYS)) {
    console.error(`Unknown state "${state}". Use one of: ${Object.keys(STATE_COVERAGE_DAYS).join(', ')}`)
    process.exit(1)
  }

  assertNotProduction()

  const prisma = new PrismaClient()
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  const existing = await prisma.towTruck.findUnique({ where: { phone } })

  // mustChangePassword: false on purpose — true would send the dashboard
  // straight to the forced password-change gate instead of the dashboard
  // itself, which is the thing being tested.
  const deactivationReason = STATE_DEACTIVATION[state] ?? null
  const credentials = {
    passwordHash,
    mustChangePassword: false,
    isActive: deactivationReason === null,
    deactivationReason,
  }

  const towTruck = existing
    ? await prisma.towTruck.update({ where: { phone }, data: credentials })
    : await prisma.towTruck.create({
        data: {
          ...credentials,
          slug: `test-driver-${phone.slice(-4)}`,
          driverName: `Թեստ Վարորդ ${phone.slice(-4)}`,
          phone,
          description: 'Լոկալ թեստային պրոֆիլ (scripts/create-test-driver.js)',
          vehicleBrand: 'Test',
          vehicleYear: 2020,
          // Slugs, not labels — the backend stores raw slugs and the frontend
          // resolves them (CLAUDE.md § "Core architectural decision").
          vehicleType: 'flatbed',
          capacityTons: 3,
          locationName: 'Երևան, Արաբկիր',
          serviceAreas: [{ name: 'Արաբկիր', slug: 'arabkir', type: 'district' }],
          services: [],
        },
      })

  const coveredUntil = await applyState(prisma, towTruck.id, state)

  console.log(`Database: ${databaseLabel()}`)
  console.log(`${existing ? 'Updated' : 'Created'} test driver #${towTruck.id} (${towTruck.slug}) — state: ${state}`)
  console.log(coveredUntil ? `Covered until: ${coveredUntil.toISOString()}` : 'No payments — never billed')
  if (deactivationReason) console.log(`Deactivated — reason: ${deactivationReason}`)
  console.log(`Log in at http://localhost:3002/login — phone ${phone}, password "${password}"`)
  await prisma.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
