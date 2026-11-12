/**
 * The demo driver account for App Store / Google Play review (2026-11-12).
 *
 * Reviewers cannot sign up themselves (the app takes Armenian +374 numbers
 * only, and a sign-up waits for an admin), so both stores require working
 * credentials in the submission. This creates — or RESETS — exactly one
 * account, and touches nothing else:
 *
 *   - phone +374 00 000001 (no operator uses 00, so it is nobody's real number)
 *   - an APP-ONLY website profile: hidden from evakuators.am (`appOnly`), with
 *     a base in Yerevan, so the profile, photos/edit and wallet screens all work
 *   - app access ACTIVE (re-granted if a reviewer tested «Delete account»)
 *   - a 20 000 ֏ demo balance, once, as an admin credit with a note
 *
 * Safe on production by design (it is FOR production): it only upserts rows
 * keyed by that phone. Re-run it before every submission — it restores the
 * password and access after a reviewer changed or deleted them.
 *
 * Usage (from backend/, with DATABASE_URL pointing at the target database):
 *   node scripts/create-review-account.js '<password>'
 *
 * The credentials live OUTSIDE git (the repo is public): see
 * docs/live-dispatch/12-store-submission.md § «App Review account».
 */
require('dotenv/config')
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')

const REVIEW_PHONE = '+37400000001'
const REVIEW_SLUG = 'app-review-demo'
const DEMO_BALANCE_AMD = 20000

async function main() {
  const [password] = process.argv.slice(2)
  if (!password || password.length < 8) {
    console.error("Usage: node scripts/create-review-account.js '<password, at least 8 characters>'")
    process.exit(1)
  }

  const prisma = new PrismaClient()
  const passwordHash = await bcrypt.hash(password, 12) // driver-auth BCRYPT_ROUNDS

  const profile = {
    driverName: 'App Review (Demo)',
    description: 'Demo account for App Store / Google Play review. Not shown on evakuators.am.',
    vehicleBrand: 'Isuzu',
    vehicleModel: 'NQR',
    vehicleYear: 2018,
    vehicleType: 'flatbed',
    capacityTons: 3.5,
    locationName: 'Երևան',
    latitude: '40.177200',
    longitude: '44.512600',
    locationUpdatedAt: new Date(),
    serviceAreas: [],
    services: [],
    // Hidden from the website: an app driver who never asked to be published
    isActive: false,
    appOnly: true,
    deactivationReason: null,
    passwordHash,
    mustChangePassword: false,
  }

  const truck = await prisma.towTruck.upsert({
    where: { phone: REVIEW_PHONE },
    update: profile,
    create: { ...profile, phone: REVIEW_PHONE, slug: REVIEW_SLUG },
    select: { id: true },
  })

  // App access: one SITE_LINKED row for the truck — (re)activated
  const [driver] = await prisma.$queryRawUnsafe(
    `INSERT INTO "FleetDriver" ("kind", "status", "towTruckId") VALUES ('SITE_LINKED', 'ACTIVE', $1)
     ON CONFLICT ("towTruckId") DO UPDATE SET "status" = 'ACTIVE', "statusReason" = NULL, "statusChangedAt" = now(), "updatedAt" = now()
     RETURNING "id"`,
    truck.id,
  )
  const driverId = Number(driver.id)

  // Not blocked, whatever a previous test left behind
  await prisma.$executeRawUnsafe(
    `UPDATE "DriverPresence" SET "dispatchSuspendedAt" = NULL, "dispatchSuspendedReason" = NULL, "dispatchSuspendedBy" = NULL,
            "dispatchSuspendedUntil" = NULL, "updatedAt" = now()
      WHERE "driverId" = $1`,
    driverId,
  )

  // The demo balance, once: an admin credit with a note, like any hand credit
  const [{ entries }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS "entries" FROM "WalletEntry" WHERE "driverId" = $1`, driverId)
  if (Number(entries) === 0) {
    const [admin] = await prisma.$queryRawUnsafe(`SELECT "id" FROM "User" WHERE "role" = 'ADMIN' ORDER BY "id" LIMIT 1`)
    if (admin) {
      await prisma.$transaction([
        prisma.$executeRawUnsafe(
          `INSERT INTO "DriverWallet" ("driverId", "balanceAmd") VALUES ($1, $2)
           ON CONFLICT ("driverId") DO UPDATE SET "balanceAmd" = "DriverWallet"."balanceAmd" + $2, "updatedAt" = now()`,
          driverId,
          DEMO_BALANCE_AMD,
        ),
        prisma.$executeRawUnsafe(
          `INSERT INTO "WalletEntry" ("driverId", "kind", "amountAmd", "balanceAfterAmd", "note", "createdByUserId")
           VALUES ($1, 'ADMIN_CREDIT', $2, (SELECT "balanceAmd" FROM "DriverWallet" WHERE "driverId" = $1), 'App Review demo balance', $3)`,
          driverId,
          DEMO_BALANCE_AMD,
          Number(admin.id),
        ),
      ])
    } else {
      console.warn('No ADMIN user yet — demo balance skipped (create one with npm run admin:create, then re-run).')
    }
  }

  console.log(`Review account ready: phone ${REVIEW_PHONE} (in the app: 00 000001), TowTruck #${truck.id}, driver #${driverId}`)
  await prisma.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
