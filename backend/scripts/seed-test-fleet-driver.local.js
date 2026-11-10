require('dotenv/config')
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')
const { assertSafeDatabase } = require('./assert-safe-environment')

// Usage: node scripts/seed-test-fleet-driver.local.js [phone] [password] [name]
const PHONE = process.argv[2] || '+37491000001'
const PASSWORD = process.argv[3] || 'test1234'
const NAME = process.argv[4] || 'Թեստ Վարորդ'
const BCRYPT_ROUNDS = 12

async function main() {
  // Never against production: refuses unless DATABASE_URL is local/staging
  assertSafeDatabase('seed a test fleet driver')
  const prisma = new PrismaClient()
  const hash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS)
  await prisma.$executeRawUnsafe(
    `INSERT INTO "FleetDriver" ("kind", "status", "phone", "passwordHash", "driverName", "vehicleType", "capacityTons", "manipulator", "wheelSkates")
     VALUES ('APP_ONLY', 'ACTIVE', $1, $2, $3, $4, $5::float8, $6::boolean, $7::boolean)
     ON CONFLICT ("phone") WHERE "phone" IS NOT NULL DO UPDATE
       SET "status" = 'ACTIVE', "passwordHash" = EXCLUDED."passwordHash", "updatedAt" = now()`,
    PHONE, hash, NAME, 'flatbed', 3, false, false,
  )
  console.log('OK — phone:', PHONE, 'password:', PASSWORD)
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
