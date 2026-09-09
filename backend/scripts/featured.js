/**
 * One-off CLI for testing the paid top placement locally.
 *
 * ## Why this exists
 *
 * The two things worth checking about a placement are the ORDER of several of
 * them and what happens when one RUNS OUT. Neither is reachable by clicking:
 * the panel grants a minimum of one day, so seeing an expiry through the UI
 * means waiting until tomorrow, and seeing the queue order means finding three
 * drivers based in the same town and granting them in a particular sequence.
 *
 * So this grants with an explicit `featuredAt`, and can push an existing end
 * date into the past — which is exactly the state the hourly sweep has not
 * caught yet, and the one where reads have to hold the line on their own
 * (`isFeaturedNow`). That state is the whole reason the window is applied on
 * read rather than only swept, so it is the one most worth being able to
 * produce on demand.
 *
 * Guarded by `assertSafeDatabase` like every other script here: it refuses to
 * run against anything that has not declared itself development or staging.
 *
 * Usage, from backend/:
 *   node scripts/featured.js list
 *   node scripts/featured.js grant +37491000001 7          # 7 days from now
 *   node scripts/featured.js grant +37491000001 7 --ago 2  # bought 2 days ago
 *   node scripts/featured.js expire +37491000001           # end date → 1 min ago
 *   node scripts/featured.js revoke +37491000001
 *   node scripts/featured.js sweep                         # what the cron does
 */
require('dotenv/config')
const { PrismaClient } = require('@prisma/client')
const { assertSafeDatabase } = require('./assert-safe-environment')

const DAY_MS = 24 * 60 * 60 * 1000

function flag(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

async function findByPhone(prisma, phone) {
  const truck = await prisma.towTruck.findFirst({
    where: { phone },
    select: {
      id: true,
      driverName: true,
      phone: true,
      citySlug: true,
      districtSlug: true,
      locationName: true,
      isFeatured: true,
      featuredAt: true,
      featuredUntil: true,
    },
  })
  if (!truck) throw new Error(`Չի գտնվել վարորդ ${phone} համարով`)
  return truck
}

function describe(truck, now) {
  const live =
    truck.isFeatured && (truck.featuredUntil === null || truck.featuredUntil.getTime() > now)
  const left = truck.featuredUntil
    ? `${Math.ceil((truck.featuredUntil.getTime() - now) / DAY_MS)} օր`
    : truck.isFeatured
      ? 'անժամկետ'
      : '—'
  return [
    String(truck.id).padStart(4),
    truck.phone.padEnd(14),
    (truck.driverName ?? '').padEnd(22),
    (truck.locationName ?? '').padEnd(20),
    // The distinction the whole design turns on: the stored flag can be true
    // while the window has closed, for up to an hour. Reads must already say
    // "no" in that state; the sweep only tidies the row afterwards.
    `flag=${truck.isFeatured ? 'yes' : 'no '}`,
    `live=${live ? 'YES' : 'no '}`,
    `left=${left}`,
    truck.featuredAt ? `bought=${truck.featuredAt.toISOString()}` : '',
  ].join('  ')
}

async function main() {
  const { label } = assertSafeDatabase('manage featured placements')
  const command = process.argv[2]
  const phone = process.argv[3]
  const prisma = new PrismaClient()
  const now = Date.now()

  try {
    if (command === 'list') {
      const trucks = await prisma.towTruck.findMany({
        where: { isFeatured: true },
        select: {
          id: true,
          driverName: true,
          phone: true,
          citySlug: true,
          districtSlug: true,
          locationName: true,
          isFeatured: true,
          featuredAt: true,
          featuredUntil: true,
        },
        orderBy: [{ featuredAt: { sort: 'desc', nulls: 'last' } }],
      })
      console.log(`\n${label}: ${trucks.length} առաջխաղացում\n`)
      for (const truck of trucks) console.log(describe(truck, now))
      console.log('\nՑուցակի կարգը նույնն է, ինչ գլխավոր էջինը՝ վերջին գնողն առաջինը։')
      return
    }

    if (command === 'sweep') {
      const { count } = await prisma.towTruck.updateMany({
        where: { isFeatured: true, featuredUntil: { not: null, lte: new Date(now) } },
        data: { isFeatured: false, featuredAt: null, featuredUntil: null },
      })
      console.log(`Ավարտվեց ${count} առաջխաղացում (նույնը, ինչ ժամային cron-ը)`)
      return
    }

    if (!phone) throw new Error('Հեռախոսահամարը պարտադիր է')
    const truck = await findByPhone(prisma, phone)

    if (command === 'grant') {
      const days = Number(process.argv[4] ?? 7)
      if (!Number.isInteger(days) || days < 1 || days > 30) {
        throw new Error('Օրերի քանակը պետք է լինի 1-ից 30')
      }
      // `--ago` backdates the PURCHASE, not the expiry: it is how you build a
      // queue of several placements in one town without waiting days between
      // them, since `featuredAt` is what orders them.
      const agoDays = Number(flag('ago') ?? 0)
      const at = new Date(now - agoDays * DAY_MS)
      const until = new Date(at.getTime() + days * DAY_MS)

      await prisma.towTruck.update({
        where: { id: truck.id },
        data: { isFeatured: true, featuredAt: at, featuredUntil: until },
      })
      console.log(`✓ ${truck.driverName} — ${days} օր, մինչև ${until.toISOString()}`)
      console.log(`  բազան՝ ${truck.locationName} (${truck.citySlug ?? truck.districtSlug})`)
      return
    }

    if (command === 'expire') {
      // One minute ago, not an hour: this is meant to reproduce the gap the
      // sweep has not closed yet, so the flag stays `true` and every read has
      // to decide for itself that the placement is over.
      const until = new Date(now - 60_000)
      await prisma.towTruck.update({
        where: { id: truck.id },
        data: { isFeatured: true, featuredUntil: until },
      })
      console.log(`✓ ${truck.driverName} — ժամկետը լրացած է, դրոշը դեռ true`)
      console.log('  Էջը թարմացրեք՝ վարորդը այլևս չպետք է լինի առաջինը։')
      return
    }

    if (command === 'revoke') {
      await prisma.towTruck.update({
        where: { id: truck.id },
        data: { isFeatured: false, featuredAt: null, featuredUntil: null },
      })
      console.log(`✓ ${truck.driverName} — առաջխաղացումը հանված է`)
      return
    }

    throw new Error(`Անհայտ հրաման: ${command ?? '(չկա)'}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
