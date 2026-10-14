import { describe, expect, it } from 'vitest'
import { sqlUtc } from '../src/common/sql-utc'

/**
 * The raw-SQL date helper. What it guards against is verified against a real
 * PostgreSQL 16 in a session whose TimeZone is Asia/Yerevan: a bare bound
 * `Date` compared four hours off and was written four hours shifted. These
 * tests pin the SQL it produces, since the behaviour itself needs a database.
 */
describe('sqlUtc', () => {
  it('binds the instant as an ISO string and converts it explicitly to UTC', () => {
    const fragment = sqlUtc(new Date('2026-10-14T12:00:00.000Z'))
    expect(fragment.sql).toBe("(?::timestamptz AT TIME ZONE 'UTC')")
    expect(fragment.values).toEqual(['2026-10-14T12:00:00.000Z'])
  })
})
