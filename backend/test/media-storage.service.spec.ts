import { mkdtemp, readFile, readdir, rm, stat, writeFile, mkdir, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConfigService } from '@nestjs/config'
import { MediaStorageService } from '../src/storage/media-storage.service'

/** Lets one test force the next generated file name, to simulate a collision */
const uuidOverride = vi.hoisted(() => ({ next: null as string | null }))
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return {
    ...actual,
    randomUUID: () => {
      const forced = uuidOverride.next
      uuidOverride.next = null
      return forced ?? actual.randomUUID()
    },
  }
})

/**
 * MediaStorageService against a real temporary directory — the filesystem is
 * the thing under test, so mocking it would prove nothing.
 *
 * What these pin:
 * - an upload lands at `<root>/<folder>/<uuid>.webp` and the URL is the public
 *   prefix plus exactly that path (the nginx `/media/` alias depends on it);
 * - no temporary file survives a successful write;
 * - `MEDIA_READ_ONLY` refuses both writes before touching the disk — on a
 *   staging/local copy of production's database the nightly purge must never
 *   delete a file, wherever MEDIA_DIR points;
 * - removal is idempotent and refuses a path that escapes the root;
 * - a failure never reaches a driver as raw `fs` error text.
 */

let root: string

function service(writesDisabled = false, dir = root): MediaStorageService {
  const media = { dir, publicUrl: 'https://evakuators.am/media', writesDisabled }
  return new MediaStorageService({ getOrThrow: () => media } as unknown as ConfigService)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'media-storage-'))
})

afterEach(async () => {
  await chmod(root, 0o755).catch(() => undefined)
  await rm(root, { recursive: true, force: true })
})

describe('MediaStorageService', () => {
  it('writes the file under the folder and returns a URL that mirrors its path', async () => {
    const stored = await service().uploadWebp(Buffer.from('webp-bytes'), 'uploads')

    expect(stored.path).toMatch(/^uploads\/[0-9a-f-]{36}\.webp$/)
    expect(stored.url).toBe(`https://evakuators.am/media/${stored.path}`)
    expect(await readFile(join(root, stored.path), 'utf8')).toBe('webp-bytes')
    expect(await readdir(join(root, 'uploads'))).toEqual([stored.path.split('/')[1]])
  })

  it('never overwrites an existing file, even on a name collision', async () => {
    const storage = service()
    const first = await storage.uploadWebp(Buffer.from('driver-A'), 'uploads')
    // Force the next file name to collide with the first upload's
    uuidOverride.next = first.path.slice('uploads/'.length, -'.webp'.length)

    await expect(storage.uploadWebp(Buffer.from('driver-B'), 'uploads')).rejects.toThrow(
      'Նկարի բեռնումը ձախողվեց, փորձեք կրկին',
    )
    expect(await readFile(join(root, first.path), 'utf8')).toBe('driver-A')
    expect(await readdir(join(root, 'uploads'))).toEqual([first.path.split('/')[1]])
  })

  it('removes files, and treats an already-missing file as removed', async () => {
    const storage = service()
    const stored = await storage.uploadWebp(Buffer.from('x'), 'uploads')

    await storage.remove([stored.path, 'uploads/never-existed.webp'])

    await expect(stat(join(root, stored.path))).rejects.toThrow()
  })

  it('refuses a path that resolves outside the media root', async () => {
    const outside = join(root, '..', `outside-${Date.now()}.txt`)
    await writeFile(outside, 'keep me')
    try {
      await expect(service().remove([`../${outside.split('/').pop()}`])).rejects.toThrow(
        'Նկարի ջնջումը ձախողվեց, փորձեք կրկին',
      )
      expect(await readFile(outside, 'utf8')).toBe('keep me')
    } finally {
      await rm(outside, { force: true })
    }
  })

  it('never leaks raw fs error text when a write fails', async () => {
    await mkdir(join(root, 'uploads'))
    await chmod(join(root, 'uploads'), 0o555)
    // root bypasses permission bits — nothing to assert on such a machine
    if (process.getuid?.() === 0) return

    await expect(service().uploadWebp(Buffer.from('x'), 'uploads')).rejects.toThrow(
      'Նկարի բեռնումը ձախողվեց, փորձեք կրկին',
    )
    await chmod(join(root, 'uploads'), 0o755)
  })

  it('creates MEDIA_DIR at boot when it does not exist yet', async () => {
    const nested = join(root, 'a', 'b')
    await service(false, nested).onModuleInit()
    expect((await stat(nested)).isDirectory()).toBe(true)
  })

  describe('read-only mode', () => {
    it('refuses uploadWebp() without writing anything', async () => {
      await expect(service(true).uploadWebp(Buffer.from('x'), 'uploads')).rejects.toThrow(
        /անջատված/,
      )
      expect(await readdir(root)).toEqual([])
    })

    it('refuses remove() and leaves the file in place', async () => {
      const stored = await service().uploadWebp(Buffer.from('x'), 'uploads')

      await expect(service(true).remove([stored.path])).rejects.toThrow(/անջատված/)
      expect((await stat(join(root, stored.path))).isFile()).toBe(true)
    })

    it('keeps remove([]) a silent no-op', async () => {
      await expect(service(true).remove([])).resolves.toBeUndefined()
    })

    it('does not touch the disk at boot', async () => {
      const missing = join(root, 'never-created')
      await service(true, missing).onModuleInit()
      await expect(stat(missing)).rejects.toThrow()
    })
  })
})
