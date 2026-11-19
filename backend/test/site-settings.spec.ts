import { describe, expect, it, vi } from 'vitest'
import { SiteSettingsService, parseDesign } from '../src/site-settings/site-settings.service'

/** A PrismaService stand-in: the service only uses $queryRawUnsafe (through PrismaSqlDatabase) */
function fakePrisma(rows: { key: string; value: unknown }[] | Error) {
  const store = Array.isArray(rows) ? [...rows] : rows
  const $queryRawUnsafe = vi.fn(async (sql: string, ...params: unknown[]) => {
    if (store instanceof Error) throw store
    if (sql.startsWith('INSERT')) {
      const value = JSON.parse(String(params[0]))
      const existing = store.find((r) => r.key === 'design')
      if (existing) existing.value = value
      else store.push({ key: 'design', value })
      return []
    }
    return store
  })
  return { $queryRawUnsafe } as never
}

describe('site settings (2026-11-18)', () => {
  it('design is 1 unless explicitly 2', () => {
    expect(parseDesign(2)).toBe(2)
    expect(parseDesign(1)).toBe(1)
    expect(parseDesign('2')).toBe(1)
    expect(parseDesign(null)).toBe(1)
  })

  it('defaults to design 1, even when the table is missing', async () => {
    expect(await new SiteSettingsService(fakePrisma([])).get()).toEqual({ design: 1 })
    expect(await new SiteSettingsService(fakePrisma(new Error('relation "SiteSetting" does not exist'))).get()).toEqual({ design: 1 })
  })

  it('a switch is read back at once (the cache is dropped on write), and cached otherwise', async () => {
    const prisma = fakePrisma([])
    const service = new SiteSettingsService(prisma)
    expect(await service.get()).toEqual({ design: 1 })
    expect(await service.setDesign(2, 7)).toEqual({ design: 2 })
    const calls = (prisma as unknown as { $queryRawUnsafe: { mock: { calls: unknown[] } } }).$queryRawUnsafe.mock.calls.length
    await service.get()
    await service.get()
    expect((prisma as unknown as { $queryRawUnsafe: { mock: { calls: unknown[] } } }).$queryRawUnsafe.mock.calls.length).toBe(calls)
  })
})
