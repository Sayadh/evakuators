/**
 * The OpenAPI document and the code must describe the same API:
 * - every route declared in the live-dispatch controllers is documented,
 * - every documented live-dispatch path exists in a controller,
 * - every $ref resolves,
 * - the error-code enum equals DISPATCH_ERRORS exactly.
 * Controllers are read as TEXT (the same technique the repo's other sync
 * tests use), so this runs without Nest installed.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { DISPATCH_ERRORS } from '../src/live-dispatch/platform/errors'

const root = join(__dirname, '..')
const spec = JSON.parse(readFileSync(join(root, '..', 'docs', 'live-dispatch', 'openapi.json'), 'utf8'))

function controllerRoutes(file: string): { method: string; path: string }[] {
  const text = readFileSync(join(root, 'src', 'live-dispatch', 'nest', file), 'utf8')
  const out: { method: string; path: string }[] = []
  const blocks = text.split(/@Controller\(/).slice(1)
  for (const block of blocks) {
    const prefix = /^'([^']*)'/.exec(block)![1]
    for (const match of block.matchAll(/@(Get|Post|Put|Patch|Delete)\('([^']*)'\)/g)) {
      const path = `/${prefix}/${match[2]}`.replace(/\/+$/, '').replace(/:(\w+)/g, '{$1}')
      out.push({ method: match[1].toLowerCase(), path })
    }
  }
  return out
}

describe('OpenAPI contract', () => {
  const routes = [
    ...controllerRoutes('driver-app.controller.ts'),
    ...controllerRoutes('ops.controller.ts'),
    ...controllerRoutes('live-dispatch.module.ts'),
  ]

  it('found the routes (the parser is not silently matching nothing)', () => {
    assert.ok(routes.length >= 35, String(routes.length))
  })

  it('every controller route is documented with the same method', () => {
    const normalise = (p: string) => p.replace(/\{[^}]+\}/g, '{}')
    const documented = new Set(
      Object.entries(spec.paths as Record<string, Record<string, unknown>>).flatMap(([path, ops]) =>
        Object.keys(ops).map((method) => `${method} ${normalise(path)}`),
      ),
    )
    const missing = routes.filter((r) => !documented.has(`${r.method} ${normalise(r.path)}`))
    assert.deepEqual(missing, [])
  })

  it('every documented path exists in code', () => {
    const normalise = (p: string) => p.replace(/\{[^}]+\}/g, '{}')
    const inCode = new Set(routes.map((r) => `${r.method} ${normalise(r.path)}`))
    const extra = Object.entries(spec.paths as Record<string, Record<string, unknown>>)
      .flatMap(([path, ops]) => Object.keys(ops).map((method) => `${method} ${normalise(path)}`))
      .filter((key) => !inCode.has(key))
    assert.deepEqual(extra, [])
  })

  it('every $ref resolves', () => {
    const refs: string[] = []
    const walk = (node: unknown) => {
      if (Array.isArray(node)) node.forEach(walk)
      else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
          if (key === '$ref' && typeof value === 'string') refs.push(value)
          else walk(value)
        }
      }
    }
    walk(spec)
    for (const ref of refs) {
      const target = ref
        .replace(/^#\//, '')
        .split('/')
        .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], spec)
      assert.ok(target, `unresolved ${ref}`)
    }
    assert.ok(refs.length > 50)
  })

  it('error codes: documented enum ≡ DISPATCH_ERRORS', () => {
    assert.deepEqual([...spec.components.schemas.ErrorCode.enum].sort(), Object.keys(DISPATCH_ERRORS).sort())
  })
})
