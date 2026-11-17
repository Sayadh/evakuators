import { describe, expect, it } from 'vitest'
import { toReport } from '~/utils/errorReport'

describe('admin error reports (2026-11-17)', () => {
  it('reports a real admin-page bug with its stack', () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'id')")
    const report = toReport(error, '/admin/orders/6')
    expect(report?.message).toBe("TypeError: Cannot read properties of undefined (reading 'id')")
    expect(report?.stack).toContain('TypeError')
  })

  it('ignores the public site, extensions, network blips and API errors (the backend records those)', () => {
    expect(toReport(new Error('boom'), '/yerevan')).toBeNull()
    expect(toReport(new Error('ResizeObserver loop completed with undelivered notifications'), '/admin')).toBeNull()
    expect(toReport(new TypeError('Failed to fetch'), '/admin/orders')).toBeNull()
    const apiError = Object.assign(new Error('Request failed'), { statusCode: 500 })
    expect(toReport(apiError, '/admin/orders')).toBeNull()
  })

  it('a thrown string or object is still a report', () => {
    expect(toReport('plain', '/admin')?.message).toBe('plain')
    expect(toReport({ weird: true }, '/admin')?.message).toBe('{"weird":true}')
  })
})
