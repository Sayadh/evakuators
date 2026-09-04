import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * `.env.example` must never carry a real secret.
 *
 * ## Why this is a test and not a rule people remember
 *
 * It is committed, the repository is public, and it sits one letter away from
 * `.env`, which is not. It has already happened once: real Idram merchant
 * credentials were pasted here during local setup and were committed by a
 * later `git add -A` that nobody read the diff of. The history had to be
 * rewritten. Nothing about that sequence is unusual, so the guard has to be
 * mechanical.
 *
 * The rule: every variable whose NAME says it holds a credential must be
 * empty, or a `CHANGE_ME` placeholder, or an obvious `YOUR_...` stand-in. A
 * secret is exactly the kind of value that looks fine at a glance — the point
 * of matching on the name is that no judgement is required at review time.
 */

const ENV_EXAMPLE = fileURLToPath(new URL('../.env.example', import.meta.url))

/** Names that hold a credential — matched on the name, never on how the value looks */
const SECRET_NAME = /(SECRET|TOKEN|PASSWORD|_KEY|PEPPER|REC_ACCOUNT)$/

/** What a placeholder is allowed to look like */
const PLACEHOLDER = /^(|CHANGE_ME|YOUR_[A-Z_]+)$/

function variables(): Array<{ name: string; value: string; line: number }> {
  return readFileSync(ENV_EXAMPLE, 'utf8')
    .split('\n')
    .map((text, index) => ({ text, line: index + 1 }))
    .filter(({ text }) => /^[A-Z][A-Z0-9_]*=/.test(text))
    .map(({ text, line }) => {
      const [name, ...rest] = text.split('=')
      // Strip one layer of surrounding quotes, the way a dotenv reader would.
      const value = rest.join('=').trim().replace(/^"(.*)"$/, '$1')
      return { name, value, line }
    })
}

describe('.env.example carries no real secrets', () => {
  it('finds the variables at all — a rename must not silently disarm this', () => {
    const names = variables().map((variable) => variable.name)
    expect(names).toContain('IDRAM_SECRET_KEY')
    expect(names).toContain('DRIVER_JWT_SECRET')
    expect(names.length).toBeGreaterThan(20)
  })

  it('leaves every credential empty or an obvious placeholder', () => {
    const leaked = variables()
      .filter((variable) => SECRET_NAME.test(variable.name))
      .filter((variable) => !PLACEHOLDER.test(variable.value))
      .map((variable) => `${variable.name} (line ${variable.line})`)

    // Named in the failure so the fix is obvious: move the value to
    // backend/.env (gitignored) or the server's ecosystem.config.js, put an
    // empty string here — and if it was ever committed, treat it as disclosed
    // and rotate it.
    expect(leaked).toEqual([])
  })

  it('keeps a credential out of DATABASE_URL too', () => {
    // The one place a secret hides inside a value rather than as one.
    const url = variables().find((variable) => variable.name === 'DATABASE_URL')?.value ?? ''
    const password = url.match(/^postgresql:\/\/[^:]+:([^@]*)@/)?.[1]
    expect(password).toBe('CHANGE_ME')
  })
})
