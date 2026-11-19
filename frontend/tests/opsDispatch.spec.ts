import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { realtimeUrl } from '~/utils/realtimeUrl'
import {
  ATTENTION_LABEL,
  ORDER_STATUS_LABEL,
  REASON_LABEL,
  SEARCH_FAILURE_KINDS,
  DRIVERLESS_ATTENTION_KINDS,
  availabilitySummary,
  formatArmenianPhone,
  formatMeters,
  formatSeconds,
  gpsDiagnosis,
} from '~/utils/opsDispatchLabels'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (path: string) => readFileSync(`${ROOT}${path}`, 'utf8')

describe('live dispatch console', () => {
  it('labels every status, attention kind and availability reason the API can send', () => {
    // Read from the backend's own source of truth, as text — the projects share no code.
    const states = read('../backend/src/live-dispatch/orders/domain/order-state.ts')
    const statuses = /ORDER_STATUSES = \[([\s\S]*?)\] as const/.exec(states)![1].match(/'([A-Z_]+)'/g)!.map((s) => s.slice(1, -1))
    expect(Object.keys(ORDER_STATUS_LABEL).sort()).toEqual([...statuses].sort())
    const availability = read('../backend/src/live-dispatch/fleet/domain/availability.ts')
    const reasons = /export type IneligibleReason =([\s\S]*?)\n\n/.exec(availability)![1].match(/'([A-Z_]+)'/g)!.map((s) => s.slice(1, -1))
    expect(Object.keys(REASON_LABEL).sort()).toEqual([...reasons].sort())
    const attention = /export type AttentionKind =([\s\S]*?)\n\n/.exec(states)![1].match(/'([A-Z_]+)'/g)!.map((s) => s.slice(1, -1))
    expect(Object.keys(ATTENTION_LABEL).sort()).toEqual([...attention].sort())
    expect(SEARCH_FAILURE_KINDS).toEqual(['SEARCH_EXHAUSTED', 'SEARCH_TIMEOUT', 'MANUAL_OFFER_FAILED'])
    // A new search / manual offer is allowed from the same driverless kinds as the backend
    expect(states).toContain("DRIVERLESS_ATTENTION_KINDS: readonly AttentionKind[] = [...SEARCH_ATTENTION_KINDS, 'CUSTOMER_PENDING']")
    expect(DRIVERLESS_ATTENTION_KINDS).toEqual([...SEARCH_FAILURE_KINDS, 'CUSTOMER_PENDING'])
  })

  it('formats distances and times without inventing precision', () => {
    expect(formatMeters(null)).toBe('—')
    expect(formatMeters(850)).toBe('850 մ')
    expect(formatMeters(4120)).toBe('4.1 կմ')
    expect(formatSeconds(null)).toBe('—')
    expect(formatSeconds(20)).toBe('1 րոպե')
    expect(formatSeconds(3900)).toBe('1 ժ 5 ր')
    expect(formatArmenianPhone('+37491000001')).toBe('+374 91 00 00 01')
  })

  it('summarises availability in one line, busy before offline', () => {
    const base = { eligible: false, reasons: [], admin: 'APPROVED', preference: 'ONLINE', connection: 'FRESH', gps: 'FRESH', occupancy: 'FREE', gpsAgeSeconds: 5, heartbeatAgeSeconds: 5 } as const
    expect(availabilitySummary({ ...base, eligible: true }).tone).toBe('ok')
    expect(availabilitySummary({ ...base, occupancy: 'ON_ORDER', reasons: ['ON_ORDER'] }).text).toBe('Ակտիվ պատվերով')
    expect(availabilitySummary({ ...base, preference: 'OFFLINE', reasons: ['OFFLINE_BY_CHOICE'] }).tone).toBe('off')
  })

  it('derives the WebSocket URL from the API base (wss for https) and never puts the token in it', () => {
    expect(realtimeUrl('https://api.evakuators.am/api/v1')).toBe('wss://api.evakuators.am/api/v1/realtime')
    expect(realtimeUrl('http://localhost:4002/api/v1/')).toBe('ws://localhost:4002/api/v1/realtime')
    const composable = read('composables/useOpsRealtime.ts')
    expect(composable).toContain("type: 'auth'")
    expect(composable).not.toContain('?token=')
  })

  it('every mutation in the console repository sends an Idempotency-Key', () => {
    const repo = read('repositories/opsDispatch.repository.ts')
    for (const call of ['createOrder', 'updateOrder', 'action(', 'manualOffer']) {
      const start = repo.indexOf(call)
      expect(start).toBeGreaterThan(-1)
      expect(repo.slice(start, start + 400)).toContain('auth(key)')
    }
  })

  it('the live nearby section is never written to storage (an old "online now" list is a lie)', () => {
    const page = read('pages/evakuator.vue')
    // One merged list since the live/profile merge: what is remembered is
    // that list WITHOUT its live entries (their distances were from a
    // position that has since moved).
    expect(page).toContain('remember(remembered ?? fresh, !straightLineOnly)')
    expect(page).toContain('combined.results.filter((r) => !r.live)')
    expect(page).not.toContain('remember(combined')
    expect(page).not.toContain('remember(liveResult')
  })
})

describe('gpsDiagnosis (2026-11-18)', () => {
  const base = { preference: 'ONLINE' as const, connection: 'FRESH' as const, gps: 'FRESH' as const, gpsAgeSeconds: 20, heartbeatAgeSeconds: 10 }
  it('nothing to explain: fresh, or Offline', () => {
    expect(gpsDiagnosis(base, 12)).toBeNull()
    expect(gpsDiagnosis({ ...base, preference: 'OFFLINE', connection: 'STALE' }, null)).toBeNull()
  })
  it('names the cause: asleep, coarse, no fix, fake', () => {
    expect(gpsDiagnosis({ ...base, connection: 'STALE', heartbeatAgeSeconds: 300 }, null)).toMatch(/Doze/)
    expect(gpsDiagnosis({ ...base, gps: 'INACCURATE' }, 420.4)).toMatch(/±420 մ/)
    expect(gpsDiagnosis({ ...base, gps: 'STALE', gpsAgeSeconds: 600 }, null)).toMatch(/10 ր առաջ/)
    expect(gpsDiagnosis({ ...base, gps: 'SUSPICIOUS' }, null)).toMatch(/կեղծ/)
  })
})
