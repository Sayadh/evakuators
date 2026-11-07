/**
 * Shared setup for the live-dispatch test suite (`npm run test:live`).
 *
 * Unit tests need nothing. Integration tests need a REAL Postgres reachable at
 * `LIVE_DISPATCH_TEST_DATABASE_URL` (a server URL; each test file creates and
 * drops its own `ld_test_*` database) — without it they are SKIPPED and say
 * so, never silently passed. See docs/live-dispatch/08-testing.md.
 */
import { after, before } from 'node:test'
import { DEFAULT_DISPATCH_SETTINGS, type DispatchSettings } from '../src/live-dispatch/platform/settings'
import { createTestDatabase, testDatabaseUrl, type TestDatabase } from '../src/live-dispatch/test-support/test-db'

export const integrationSkip: string | false = testDatabaseUrl()
  ? false
  : 'LIVE_DISPATCH_TEST_DATABASE_URL not set — integration test skipped'

export function useTestDatabase(): { get: () => TestDatabase } {
  let db: TestDatabase | null = null
  before(async () => {
    if (integrationSkip) return
    db = await createTestDatabase()
  })
  after(async () => {
    if (db) await db.drop()
  })
  return {
    get: () => {
      if (!db) throw new Error('test database not initialised')
      return db
    },
  }
}

export function settings(overrides: Partial<DispatchSettings> = {}): DispatchSettings {
  return { ...DEFAULT_DISPATCH_SETTINGS, ...overrides }
}

/** Yerevan, Republic Square — a point safely inside ARMENIA_BOUNDS */
export const YEREVAN = { latitude: 40.1772, longitude: 44.5126 }

export function offset(point: { latitude: number; longitude: number }, northMeters: number, eastMeters: number) {
  return {
    latitude: point.latitude + northMeters / 111_320,
    longitude: point.longitude + eastMeters / (111_320 * Math.cos((point.latitude * Math.PI) / 180)),
  }
}

export function isoSecondsAgo(seconds: number, from = new Date()): string {
  return new Date(from.getTime() - seconds * 1000).toISOString()
}
