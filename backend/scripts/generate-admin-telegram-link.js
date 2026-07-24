/**
 * Generates a one-time Telegram link-token for an existing admin account, so
 * they can connect their personal Telegram to the dedicated ADMIN bot (2FA
 * login codes + new-registration notifications). Mirrors the tow-truck
 * driver-linking flow (AdminService.generateTelegramLink) but for the User
 * model instead of TowTruck.
 *
 * Usage:
 *   node scripts/generate-admin-telegram-link.js admin@evakuators.am
 *
 * Requires ADMIN_TELEGRAM_BOT_USERNAME to already be set in backend/.env,
 * and the admin bot's webhook to be registered (see docs/deployment.md).
 * Run from backend/ with DATABASE_URL already available (reads backend/.env).
 */
require('dotenv/config')
const { PrismaClient } = require('@prisma/client')
const { randomBytes } = require('node:crypto')

const TTL_DAYS = 7

async function main() {
  const [email] = process.argv.slice(2)
  if (!email) {
    console.error('Usage: node scripts/generate-admin-telegram-link.js <email>')
    process.exit(1)
  }

  const botUsername = process.env.ADMIN_TELEGRAM_BOT_USERNAME
  if (!botUsername) {
    console.error('ADMIN_TELEGRAM_BOT_USERNAME is not set in backend/.env — set up the admin bot first.')
    process.exit(1)
  }

  const prisma = new PrismaClient()
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    console.error(`No admin account found for ${email}. Create one first with npm run admin:create.`)
    await prisma.$disconnect()
    process.exit(1)
  }

  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000)
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramLinkToken: token, telegramLinkTokenExpiresAt: expiresAt },
  })

  console.log(`Tap this link in Telegram to connect ${email} (expires in ${TTL_DAYS} days):`)
  console.log(`https://t.me/${botUsername}?start=${token}`)
  await prisma.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
