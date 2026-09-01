import { describe, expect, it, vi } from 'vitest'
import type { ConfigService } from '@nestjs/config'
import { SupabaseStorageService } from '../src/storage/supabase-storage.service'

/**
 * `SUPABASE_STORAGE_READ_ONLY` exists for exactly one situation: a staging
 * deploy sharing production's real Supabase bucket for read-only image
 * display (see docs/deployment.md § "Staging environment") must not be able
 * to upload, replace or delete anything in it — the bucket holds real
 * drivers' real photos. These tests pin that both write paths refuse before
 * touching the network, and that the flag is a no-op — today's production
 * behaviour — when unset.
 *
 * Mocks `@supabase/supabase-js`'s `createClient` rather than hitting a real
 * project: what's under test is whether SupabaseStorageService calls into
 * the client at all, not what the client does once called.
 */

const storageFrom = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ storage: { from: storageFrom } })),
}))

function fakeConfig(writesDisabled: boolean): ConfigService {
  const supabase = {
    url: 'https://project.supabase.co',
    serviceRoleKey: 'service-role-key',
    bucket: 'tow-truck-images',
    writesDisabled,
  }
  return { getOrThrow: () => supabase } as unknown as ConfigService
}

describe('SupabaseStorageService read-only mode', () => {
  it('refuses uploadWebp() before it reaches the client', async () => {
    storageFrom.mockClear()
    const service = new SupabaseStorageService(fakeConfig(true))

    await expect(service.uploadWebp(Buffer.from('x'), 'registrations')).rejects.toThrow(
      /անջատված/,
    )
    expect(storageFrom).not.toHaveBeenCalled()
  })

  it('refuses remove() before it reaches the client', async () => {
    storageFrom.mockClear()
    const service = new SupabaseStorageService(fakeConfig(true))

    await expect(service.remove(['registrations/some-photo.webp'])).rejects.toThrow(/անջատված/)
    expect(storageFrom).not.toHaveBeenCalled()
  })

  /**
   * A no-op stays a no-op regardless of the flag — there is nothing to
   * protect against removing zero objects, and this must not start throwing
   * just because it happens to run on a read-only deploy.
   */
  it('remove() with an empty list stays a silent no-op even when read-only', async () => {
    storageFrom.mockClear()
    const service = new SupabaseStorageService(fakeConfig(true))

    await expect(service.remove([])).resolves.toBeUndefined()
    expect(storageFrom).not.toHaveBeenCalled()
  })

  it('is unrestricted — production behaviour — when the flag is false', async () => {
    storageFrom.mockClear()
    storageFrom.mockReturnValue({
      upload: vi.fn(async () => ({ error: null })),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://x/y.webp' } })),
    })
    const service = new SupabaseStorageService(fakeConfig(false))

    await expect(service.uploadWebp(Buffer.from('x'), 'registrations')).resolves.toMatchObject({
      url: 'https://x/y.webp',
    })
    expect(storageFrom).toHaveBeenCalled()
  })


  /**
   * A real Supabase failure (bucket outage, quota, network) must never reach
   * a driver as the provider's own English error text — see
   * `all-exceptions.filter.ts`'s doc comment for why leaking third-party
   * error detail is the same class of problem as a bare "Internal server
   * error". The real message still has to go somewhere — the server log.
   */
  it('never leaks the raw Supabase error text when uploadWebp() fails', async () => {
    storageFrom.mockClear()
    storageFrom.mockReturnValue({
      upload: vi.fn(async () => ({ error: { message: 'bucket quota exceeded: internal detail' } })),
    })
    const service = new SupabaseStorageService(fakeConfig(false))

    await expect(service.uploadWebp(Buffer.from('x'), 'registrations')).rejects.toThrow(
      'Նկարի բեռնումը ձախողվեց, փորձեք կրկին',
    )
  })

  it('never leaks the raw Supabase error text when remove() fails', async () => {
    storageFrom.mockClear()
    storageFrom.mockReturnValue({
      remove: vi.fn(async () => ({ error: { message: 'object not found: internal detail' } })),
    })
    const service = new SupabaseStorageService(fakeConfig(false))

    await expect(service.remove(['registrations/some-photo.webp'])).rejects.toThrow(
      'Նկարի ջնջումը ձախողվեց, փորձեք կրկին',
    )
  })
})
