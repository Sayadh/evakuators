/**
 * One-off CLI to create (or update the password of) an admin account.
 * There's no self-registration for admins on purpose — this is the only way in.
 *
 * Usage:
 *   node scripts/create-admin-user.js admin@evakuators.am 'a-strong-password'
 *
 * Run from backend/ with DATABASE_URL already available (reads backend/.env).
 */
require('dotenv/config')
const { PrismaClient, UserRole } = require('@prisma/client')
const bcrypt = require('bcrypt')

async function main() {
  const [email, password] = process.argv.slice(2)

  if (!email || !password) {
    console.error('Usage: node scripts/create-admin-user.js <email> <password>')
    process.exit(1)
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters')
    process.exit(1)
  }

  const prisma = new PrismaClient()
  const passwordHash = await bcrypt.hash(password, 12)

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: UserRole.ADMIN },
    create: { email, passwordHash, role: UserRole.ADMIN },
  })

  console.log(`Admin user ready: ${user.email} (id ${user.id})`)
  await prisma.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
