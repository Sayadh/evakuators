#!/usr/bin/env node
/**
 * Ship a JS-only update to installed apps (EAS Update, 2026-11-17):
 *
 *   npm run update:preview -- "Չեղարկման էջի ուղղում"
 *   npm run update:production -- "…"
 *
 * Why a script and not a bare `eas update`: EXPO_PUBLIC_API_BASE_URL is baked
 * into the JS bundle at export time. A build gets it from its eas.json profile,
 * but `eas update` does NOT read that — it would take mobile/.env (localhost)
 * and every driver's app would start calling a server that is not there. This
 * script takes the URL from the SAME eas.json profile the build used, refuses
 * a localhost URL, runs the type check and the tests, and only then publishes.
 *
 * Reaches only builds with the same runtime version (= app `version` in
 * app.config.ts). Anything native needs a new build — see app.config.ts.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [channel, ...rest] = process.argv.slice(2)
const message = rest.join(' ').trim()
const eas = JSON.parse(readFileSync(resolve(root, 'eas.json'), 'utf8'))
const profile = Object.entries(eas.build ?? {}).find(([, p]) => p.channel === channel)

function die(text) {
  console.error(`\n✖ ${text}\n`)
  process.exit(1)
}

if (!profile) die(`No eas.json build profile has "channel": "${channel ?? ''}". Use: preview | production`)
if (!message) die('Write what changed: npm run update:preview -- "what changed"')
const apiBase = profile[1].env?.EXPO_PUBLIC_API_BASE_URL
if (!apiBase || /localhost|127\.0\.0\.1|10\.0\.2\.2/.test(apiBase)) die(`Profile "${profile[0]}" has no usable EXPO_PUBLIC_API_BASE_URL (${apiBase ?? 'none'})`)

const env = { ...process.env, EXPO_PUBLIC_API_BASE_URL: apiBase }
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', env })

console.log(`\n→ channel "${channel}" · API ${apiBase}\n→ type check and tests first…\n`)
run('npx', ['tsc', '--noEmit'])
run('npm', ['test', '--silent'])
console.log('\n→ publishing…\n')
run('npx', ['eas-cli', 'update', '--channel', channel, '--environment', profile[0], '--message', message, '--non-interactive'])
console.log(`\n✔ Published to "${channel}". Drivers get it on the next app start after it has downloaded (open → close → open).\n`)
