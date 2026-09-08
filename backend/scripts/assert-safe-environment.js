/**
 * The guard both destructive dev scripts share: "is this a database I am
 * allowed to write junk into?"
 *
 * ## Why the old check did not work
 *
 * It refused a non-`localhost` database host, and refused `NODE_ENV=production`.
 * Neither is true of the production server:
 *
 *   - production's Postgres runs ON the VPS, so its `DATABASE_URL` host is
 *     `localhost` — exactly like a developer's laptop;
 *   - `NODE_ENV` is set by PM2 for the app process, not by `backend/.env`, so
 *     a person running `node scripts/...` in an ssh session has it UNSET.
 *
 * Both guards therefore passed on the production server. `create-test-driver.js`
 * would have reset a real driver's password and inserted a fake truck into the
 * live database; `idram-callback.js` would have forged a payment confirmation
 * against it. Nothing about either script's own text was wrong — the checks
 * simply did not distinguish the two machines, because nothing in
 * `DATABASE_URL` does.
 *
 * ## What replaces it
 *
 * The environment has to SAY it is safe, rather than the script trying to prove
 * it is not. Two ways to say it, and no default:
 *
 *   - the database name ends in `_staging` (what `refresh-staging-db.sh`
 *     creates, and never what production is called); or
 *   - `NODE_ENV` is explicitly `development` or `test`.
 *
 * Unset now REFUSES, which is the whole point: the failure mode has to be a
 * script that will not run, not a script that runs somewhere it must not.
 */

/** Non-production values that count as an explicit "this is a dev machine" */
const SAFE_NODE_ENVS = new Set(['development', 'test'])

function describe(url) {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`
  } catch {
    return '(unparseable DATABASE_URL)'
  }
}

/**
 * Exits the process unless this database is a local dev one or a staging one.
 * `purpose` is what the caller would have done, quoted back in the refusal so
 * the reader knows what was prevented.
 */
function assertSafeDatabase(purpose) {
  const raw = process.env.DATABASE_URL ?? ''
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    console.error('DATABASE_URL is missing or unparseable — refusing to guess which database this is.')
    process.exit(1)
  }

  const database = parsed.pathname.replace(/^\//, '')
  const isStaging = database.endsWith('_staging')
  const nodeEnv = process.env.NODE_ENV

  if (!isStaging && !SAFE_NODE_ENVS.has(nodeEnv ?? '')) {
    console.error(`Refusing to ${purpose} against ${describe(raw)}.`)
    console.error('')
    console.error('This script only runs where the environment says it is safe:')
    console.error('  • a staging database (name ending in "_staging"), or')
    console.error('  • NODE_ENV=development (or test)')
    console.error('')
    console.error(
      nodeEnv === undefined
        ? 'NODE_ENV is not set. On a developer machine, add NODE_ENV="development" to backend/.env.'
        : `NODE_ENV is "${nodeEnv}".`,
    )
    console.error('Production is deliberately unreachable from here — there is no flag to override this.')
    process.exit(1)
  }

  // Kept from the original guard: even on a staging or dev environment, the
  // database has to be the one on this machine. A remote host means someone is
  // pointing a local checkout at a server, which is never what this is for.
  if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    console.error(`Refusing to ${purpose} against a remote database (${parsed.hostname}).`)
    process.exit(1)
  }

  return { database, isStaging, label: describe(raw) }
}

module.exports = { assertSafeDatabase }
