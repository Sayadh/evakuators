import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Every authenticated request must carry its `Authorization` header.
 *
 * ## Why this is a test and not a code review note
 *
 * `apiFetch` takes headers as an optional option, so a call that omits them
 * compiles, type-checks and lints cleanly. The failure only appears at runtime,
 * and it does not look like an auth failure: `apiFetch` treats any 401 on a
 * `/my/*` or `/admin/*` path as an EXPIRED SESSION, clears the store and
 * redirects to the login page (see `handleExpiredSession`).
 *
 * That is exactly how it shipped once. `driverAuthRepository.changePassword`
 * went out without the header, and the symptom a driver saw was: type a new
 * password, press save, get bounced to the login page — where the OLD password
 * still worked, because the request had never been authorised and the change
 * had never reached the database. Nothing in the UI said "unauthorised", and
 * the backend logged nothing unusual, because from its side the request simply
 * arrived without credentials and was correctly refused.
 *
 * The reason it was missed is worth recording too: the method lives in
 * `driverAuth.repository.ts`, next to `login()`, which legitimately needs no
 * header. Every other file in this directory is uniformly authenticated or
 * uniformly public, so the eye pattern-matches on the file rather than the call.
 *
 * ## What this checks
 *
 * Source text, not behaviour — deliberately. The alternative (mocking
 * `$fetch` and asserting on each call) would need one test per method and would
 * only cover the methods someone remembered to write a test for, which is the
 * same gap that let this through. Reading the files catches a method added
 * tomorrow, by anyone, with no test of its own.
 */

const REPOSITORY_DIR = fileURLToPath(new URL('../repositories', import.meta.url))

/** Path prefixes that are behind a guard on the backend — see apiClient.ts */
const AUTHENTICATED_PREFIXES = ['/my/', '/admin/']

interface ApiCall {
  file: string
  path: string
  hasHeaders: boolean
}

/**
 * Every `apiFetch('<path>', { ... })` call in a file, with whether its options
 * object mentions `headers`.
 *
 * The options object is matched by balancing braces rather than with a regex,
 * because a call's body can legitimately contain nested objects (`body: { ... }`)
 * and a lazy match would stop at the first `}` and report a false failure.
 */
function findApiCalls(file: string, source: string): ApiCall[] {
  const calls: ApiCall[] = []
  // Matches the opening of a call and captures the path literal. Template
  // literals are included (`/admin/tow-trucks/${id}/phone`), since those are the
  // parameterised admin routes and they need the header just as much.
  const opening = /apiFetch(?:<[^>]*>)?\(\s*['"`]([^'"`]+)['"`]/g

  let match: RegExpExecArray | null
  while ((match = opening.exec(source)) !== null) {
    const path = match[1]!
    const optionsStart = source.indexOf('{', opening.lastIndex)
    // No options object at all (e.g. a bare GET) — definitively no headers.
    if (optionsStart === -1 || source.slice(opening.lastIndex, optionsStart).includes(')')) {
      calls.push({ file, path, hasHeaders: false })
      continue
    }

    let depth = 0
    let end = optionsStart
    for (let i = optionsStart; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1
      else if (source[i] === '}') {
        depth -= 1
        if (depth === 0) {
          end = i
          break
        }
      }
    }

    calls.push({
      file,
      path,
      hasHeaders: source.slice(optionsStart, end + 1).includes('headers'),
    })
  }

  return calls
}

function allApiCalls(): ApiCall[] {
  return readdirSync(REPOSITORY_DIR)
    .filter((name) => name.endsWith('.repository.ts'))
    .flatMap((name) =>
      findApiCalls(name, readFileSync(`${REPOSITORY_DIR}/${name}`, 'utf8')),
    )
}

/**
 * Three answers, not two. A path built from a variable
 * (`` `${basePath}/charts` `` in analytics.repository.ts) cannot be classified
 * by reading the source, and pretending otherwise is what produced this test's
 * first false failure.
 *
 * `indeterminate` is treated as fail-safe below: it must carry a header. A
 * path assembled at runtime in this codebase is always a scoped one
 * (`/my/analytics`, `/admin/tow-trucks/:id/analytics`), and requiring the
 * header of anything we cannot prove is public errs in the harmless direction —
 * the failure mode of a missing header is a silent logout, the failure mode of
 * an unnecessary one is nothing.
 */
function classify(path: string): 'authenticated' | 'public' | 'indeterminate' {
  if (path.startsWith('${')) return 'indeterminate'
  return AUTHENTICATED_PREFIXES.some((prefix) => path.startsWith(prefix))
    ? 'authenticated'
    : 'public'
}

describe('repository auth headers', () => {
  it('finds the calls it is supposed to be checking', () => {
    // A detector that silently matches nothing would pass every assertion below
    // forever. This pins that the parser actually sees each kind of call.
    const calls = allApiCalls()
    expect(calls.length).toBeGreaterThan(10)
    expect(calls.some((call) => classify(call.path) === 'authenticated')).toBe(true)
    expect(calls.some((call) => classify(call.path) === 'public')).toBe(true)
  })

  it('sends an Authorization header on every /my/* and /admin/* request', () => {
    const missing = allApiCalls()
      .filter((call) => classify(call.path) !== 'public' && !call.hasHeaders)
      .map((call) => `${call.file} → ${call.path}`)

    expect(
      missing,
      'These requests hit a guarded route without credentials. The backend answers 401, ' +
        'and apiFetch reads that as an expired session — so the user is silently logged out ' +
        'and redirected instead of being told anything went wrong.',
    ).toEqual([])
  })

  /**
   * The mirror of the rule above, and not redundant with it: attaching a driver
   * or admin token to a public request would put a credential on the wire for
   * requests that are also made during SSR, where there is no user session to
   * take it from.
   */
  it('does not attach credentials to public requests', () => {
    const overreaching = allApiCalls()
      .filter((call) => classify(call.path) === 'public' && call.hasHeaders)
      .map((call) => `${call.file} → ${call.path}`)

    expect(overreaching).toEqual([])
  })
})
