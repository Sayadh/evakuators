import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { apiOriginForCsp } from '~/utils/cspOrigins'

/**
 * The bug these tests exist for: `connect-src` was hardcoded to production's
 * API hostname, so staging — which runs the same build against
 * `staging-api.evakuators.am` — refused every request it made, by its own
 * policy. The page rendered and then sat there empty.
 *
 * The two environments are asserted explicitly below, because "it works on
 * production" was exactly the state that shipped the bug.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (path: string): string => readFileSync(`${ROOT}${path}`, 'utf8')

/** Verbatim from ecosystem.config.js — production's PM2 env */
const PRODUCTION_API = 'https://api.evakuators.am/api/v1'
/** Verbatim from the staging PM2 env — see docs/deployment.md § Staging */
const STAGING_API = 'https://staging-api.evakuators.am/api/v1'

describe('apiOriginForCsp — the two deployed environments', () => {
  it('resolves production to its own origin', () => {
    expect(apiOriginForCsp(PRODUCTION_API)).toBe('https://api.evakuators.am')
  })

  it('resolves staging to its own origin, not production’s', () => {
    expect(apiOriginForCsp(STAGING_API)).toBe('https://staging-api.evakuators.am')
    // The assertion that would have caught the original bug.
    expect(apiOriginForCsp(STAGING_API)).not.toBe('https://api.evakuators.am')
  })

  it('keeps the two apart — one build, two answers', () => {
    expect(apiOriginForCsp(STAGING_API)).not.toBe(apiOriginForCsp(PRODUCTION_API))
  })

  it('drops the path, so the origin is a valid CSP source', () => {
    // A CSP source with a path is a different (and stricter) matcher — and an
    // API version prefix in a header is meaningless.
    for (const url of [PRODUCTION_API, STAGING_API]) {
      const origin = apiOriginForCsp(url)!
      expect(origin.endsWith('/api/v1')).toBe(false)
      expect(new URL(origin).pathname).toBe('/')
    }
  })
})

describe('apiOriginForCsp — local development', () => {
  it('keeps the port, which is what makes localhost a distinct origin', () => {
    expect(apiOriginForCsp('http://localhost:4002/api/v1')).toBe('http://localhost:4002')
  })

  it('allows plain http, since local dev has no certificate', () => {
    expect(apiOriginForCsp('http://127.0.0.1:4002/api/v1')).toBe('http://127.0.0.1:4002')
  })
})

describe('apiOriginForCsp — nothing to add', () => {
  /**
   * An empty base URL is the mock-mode switch (see docs/architecture.md). The
   * browser makes no API calls at all, so the policy correctly gains nothing.
   */
  it('returns null for mock mode rather than a broken entry', () => {
    expect(apiOriginForCsp('')).toBeNull()
    expect(apiOriginForCsp(undefined)).toBeNull()
    expect(apiOriginForCsp(null)).toBeNull()
  })

  it('returns null rather than passing an unparseable value into a header', () => {
    expect(apiOriginForCsp('not a url')).toBeNull()
    expect(apiOriginForCsp('/api/v1')).toBeNull()
    expect(apiOriginForCsp('api.evakuators.am/api/v1')).toBeNull()
  })

  it('refuses schemes that are not http(s)', () => {
    // A connect-src entry is a permission; only the two schemes a browser
    // would actually fetch over belong in it.
    expect(apiOriginForCsp('javascript:alert(1)')).toBeNull()
    expect(apiOriginForCsp('file:///etc/passwd')).toBeNull()
    expect(apiOriginForCsp('ftp://example.com/api')).toBeNull()
  })
})

describe('the configuration itself', () => {
  it('does not hardcode any API hostname in the static policy', () => {
    // The regression guard. Re-adding a hostname here would work on whichever
    // environment the developer happened to be looking at.
    const config = read('nuxt.config.ts')
    const connectSrc = config.slice(
      config.indexOf("'connect-src'"),
      config.indexOf('],', config.indexOf("'connect-src'")),
    )
    expect(connectSrc).not.toMatch(/api\.evakuators\.am|staging-api/)
  })

  it('allows the Google Ads host as both a fetch and an image source', () => {
    // Remarketing delivers some beacons as fetches and others as image
    // requests, so the host has to appear in both directives — listing it in
    // only one blocks half the calls, which is how it was first reported.
    const config = read('nuxt.config.ts')
    const directive = (name: string): string =>
      config.slice(config.indexOf(`'${name}'`), config.indexOf('],', config.indexOf(`'${name}'`)))

    expect(directive('connect-src')).toContain('https://www.google.com')
    expect(directive('img-src')).toContain('https://www.google.com')
  })

  it('resolves the origin from the public base URL, not the internal one', () => {
    // internalApiBaseUrl is SSR's loopback address. It is never a browser
    // connection, and publishing it in a response header would leak an
    // internal address for no benefit.
    const plugin = read('server/plugins/csp-api-origin.ts')
    expect(plugin).toContain('public.apiBaseUrl')
    expect(plugin).not.toContain('internalApiBaseUrl')
  })
})
