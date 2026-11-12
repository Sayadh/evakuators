/**
 * Admin accounts: list them, or keep ONE and delete all the others
 * (security audit 2026-11-12 — every admin account is a way in).
 *
 *   npm run admin:accounts                              # list
 *   npm run admin:accounts -- keep-only you@site.am     # dry run: shows what would be deleted
 *   npm run admin:accounts -- keep-only you@site.am --yes   # deletes
 *
 * Deleting is permanent. Safe for history: rows that recorded which admin did
 * something keep their numbers (or become empty where the database says
 * SET NULL); 2FA codes of a deleted admin go with it. A deleted admin's open
 * sessions stop working within 15 seconds (admin-session-check.ts).
 *
 * Refuses when the email to keep does not exist or is not an ADMIN — so it
 * can never leave the site with no administrator.
 * Run from backend/ (reads DATABASE_URL from backend/.env).
 */
require('dotenv/config')
const { PrismaClient } = require('@prisma/client')

async function main() {
  const [command = 'list', keepEmail, flag] = process.argv.slice(2)
  const prisma = new PrismaClient()
  try {
    const users = await prisma.user.findMany({ orderBy: { id: 'asc' }, select: { id: true, email: true, role: true, telegramChatId: true, createdAt: true } })
    const show = (u) => `#${u.id}  ${u.email}  ${u.role}  Telegram 2FA: ${u.telegramChatId ? 'yes' : 'NO'}  (created ${u.createdAt.toISOString().slice(0, 10)})`
    if (command === 'list') {
      console.log(`${users.length} admin account(s):`)
      for (const u of users) console.log('  ' + show(u))
      if (users.some((u) => !u.telegramChatId)) console.log('\nAccounts without Telegram 2FA sign in with a password only. Link: npm run admin:telegram-link')
      return
    }
    if (command !== 'keep-only' || !keepEmail) {
      console.error('Usage: npm run admin:accounts [-- keep-only <email> [--yes]]')
      process.exitCode = 1
      return
    }
    const keep = users.find((u) => u.email.toLowerCase() === keepEmail.trim().toLowerCase())
    if (!keep) {
      console.error(`No admin account with email ${keepEmail}. Nothing deleted.`)
      process.exitCode = 1
      return
    }
    if (keep.role !== 'ADMIN') {
      console.error(`${keep.email} is ${keep.role}, not ADMIN — keeping only it would leave no administrator. Nothing deleted.`)
      process.exitCode = 1
      return
    }
    const remove = users.filter((u) => u.id !== keep.id)
    console.log(`Keep:   ${show(keep)}`)
    if (remove.length === 0) {
      console.log('Nothing to delete — this is already the only admin account.')
      return
    }
    console.log(`Delete (${remove.length}):`)
    for (const u of remove) console.log('  ' + show(u))
    if (flag !== '--yes') {
      console.log('\nDry run — nothing deleted. Add --yes to delete these accounts permanently.')
      return
    }
    const result = await prisma.user.deleteMany({ where: { id: { in: remove.map((u) => u.id) } } })
    console.log(`\nDeleted ${result.count} account(s). ${keep.email} is the only admin now.`)
    if (!keep.telegramChatId) console.log('This account has NO Telegram 2FA yet — link it: npm run admin:telegram-link, then set ADMIN_REQUIRE_2FA="true".')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
