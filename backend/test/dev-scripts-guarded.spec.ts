import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Every script in `backend/scripts/` that opens a database has to have made a
 * deliberate choice about which databases it may open.
 *
 * These scripts create drivers, grant paid placements, rewrite expiry dates and
 * replay payment callbacks — the operations nobody wants performed by accident
 * against the live database because a shell had the wrong `DATABASE_URL`
 * exported. `assertSafeDatabase` is the one line that prevents it, and it is
 * one line: trivial to forget in a new script, and its absence looks like
 * nothing until the day it matters.
 *
 * ## Why an allowlist rather than "every script must be guarded"
 *
 * Two of them legitimately run against production, and blanket-guarding them
 * would break the bootstrap it exists to enable — there has to be some way to
 * create the very first admin on a live server, and some way for that admin to
 * link their Telegram. Refusing there would not be safety, it would be a script
 * nobody can use, replaced by someone pasting SQL, which is worse.
 *
 * So the rule is: guarded, or named below with a reason. That keeps the
 * decision explicit for the next script instead of leaving "unguarded" as
 * something that can happen by omission. The list is enumerated from the
 * directory, so a script added next month is covered whether or not anyone
 * remembers this file.
 */

const SCRIPTS_DIR = fileURLToPath(new URL('../scripts', import.meta.url))

/** No database of their own — nothing to guard */
const NO_DATABASE = new Set(['assert-safe-environment.js', 'check-di-graph.js'])

/**
 * Deliberately runnable against production, because each is a bootstrap step
 * that has to be possible on a live server:
 * - `create-admin-user.js` — the first admin account has to come from
 *   somewhere, and the alternative is hand-written SQL.
 * - `generate-admin-telegram-link.js` — that admin then has to link Telegram,
 *   on the server where their account actually is.
 *
 * Both are read-your-own-account operations rather than data rewrites, which is
 * what makes the exception a narrow one rather than a hole.
 */
const PRODUCTION_ALLOWED = new Set(['create-admin-user.js', 'generate-admin-telegram-link.js'])

function scripts(): string[] {
  return readdirSync(SCRIPTS_DIR).filter((name) => name.endsWith('.js') && !NO_DATABASE.has(name))
}

function source(name: string): string {
  return readFileSync(`${SCRIPTS_DIR}/${name}`, 'utf8')
}

describe('dev scripts', () => {
  it('finds the scripts at all, so the checks below cannot pass by being empty', () => {
    expect(scripts().length).toBeGreaterThan(0)
  })

  it.each(scripts())('%s is guarded, or named as a production bootstrap', (name) => {
    if (!source(name).includes('PrismaClient')) return
    if (PRODUCTION_ALLOWED.has(name)) return
    expect(source(name)).toContain('assertSafeDatabase')
  })

  it.each(scripts())('%s calls the guard before opening a client', (name) => {
    // Order matters: constructing a PrismaClient first and asserting afterwards
    // would already have connected to whatever the URL pointed at.
    const code = source(name)
    if (!code.includes('assertSafeDatabase(')) return
    expect(code.indexOf('assertSafeDatabase(')).toBeLessThan(code.indexOf('new PrismaClient('))
  })

  it('keeps the production allowlist to the two bootstrap scripts', () => {
    // Not a formality: this is the line that turns "unguarded" from something
    // that can happen by omission into something someone had to write down.
    expect([...PRODUCTION_ALLOWED].sort()).toEqual([
      'create-admin-user.js',
      'generate-admin-telegram-link.js',
    ])
  })
})
