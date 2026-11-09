import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { access, link, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { AppConfig } from '../config/configuration'

export interface StoredObject {
  /** Object path relative to the media root, e.g. `uploads/<uuid>.webp` */
  path: string
  /** Public URL the browser loads the file from */
  url: string
}

const UPLOAD_FAILED_MESSAGE = 'Նկարի բեռնումը ձախողվեց, փորձեք կրկին'
const REMOVAL_FAILED_MESSAGE = 'Նկարի ջնջումը ձախողվեց, փորձեք կրկին'

/**
 * The ONLY place in the project that writes or deletes image files.
 *
 * Photos live on the VPS's own disk, under `MEDIA_DIR`, and are served by
 * nginx straight from that directory at `MEDIA_PUBLIC_URL` (see
 * `nginx/evakuators.am.conf` § `/media/`). Node never serves them in
 * production; `main.ts` mounts the same directory at `/media` only so that a
 * deploy without that nginx block — local development — still shows them.
 *
 * Why disk and not an object store: they used to be in Supabase Storage, and
 * the free plan's egress quota ran out and took every photo on the site down
 * with HTTP 402 (docs/deployment.md § "Image storage"). The VPS is already
 * paid for, nginx serves static files faster than any round trip to a third
 * party, and the files are content-addressed (a random UUID per upload, never
 * overwritten), so they cache forever. The price is that the files are now
 * ours to back up — `scripts/backup-db.sh` does it next to the database dump.
 *
 * `path` is what the database stores alongside the URL and is the only thing
 * deletion uses, so the public URL can move (a new domain, a CDN in front)
 * with a single UPDATE and no change to the files.
 */
@Injectable()
export class MediaStorageService implements OnModuleInit {
  private readonly logger = new Logger(MediaStorageService.name)
  private readonly root: string
  private readonly publicUrl: string
  /**
   * `MEDIA_READ_ONLY=true` — staging and local copies of the database. Their
   * rows point at production's files by absolute URL, so they display fine,
   * and refusing every write here means the nightly orphan purge on such a
   * deploy can never delete anything, wherever `MEDIA_DIR` happens to point.
   */
  private readonly writesDisabled: boolean

  constructor(config: ConfigService) {
    const media = config.getOrThrow<AppConfig['media']>('media')
    this.root = resolve(media.dir)
    this.publicUrl = media.publicUrl
    this.writesDisabled = media.writesDisabled
  }

  /**
   * Fail at boot, not at the first driver's upload: a missing or unwritable
   * directory is a deploy mistake, and PM2's crash log is where it should
   * surface. Skipped on a read-only deploy, which never writes.
   */
  async onModuleInit(): Promise<void> {
    if (this.writesDisabled) return
    try {
      await mkdir(this.root, { recursive: true })
      await access(this.root, fsConstants.W_OK)
    } catch (error) {
      throw new Error(
        `MEDIA_DIR "${this.root}" is not a writable directory: ${(error as Error).message}`,
      )
    }
  }

  private assertWritable(): void {
    if (this.writesDisabled) {
      throw new ForbiddenException('Այս միջավայրում նկարների բեռնումն ու ջնջումն անջատված են')
    }
  }

  /**
   * Maps a stored `path` to a file under the media root, refusing anything
   * that resolves outside it. Every path is generated here, so this should
   * never trip — it exists because `remove()` takes paths read back from the
   * database, and a `../` there must not become a deleted file elsewhere.
   */
  private fileFor(path: string): string {
    const file = resolve(this.root, path)
    if (!file.startsWith(this.root + sep)) {
      throw new Error(`Media path escapes MEDIA_DIR: ${path}`)
    }
    return file
  }

  async uploadWebp(buffer: Buffer, folder: string): Promise<StoredObject> {
    this.assertWritable()
    const path = `${folder}/${randomUUID()}.webp`
    const file = this.fileFor(path)
    // Write to a temporary name, then publish it with link(), never rename():
    // - nginx must never serve a half-written file, and a crash mid-write must
    //   not leave one at the final name;
    // - link() fails with EEXIST instead of replacing, so an existing file —
    //   another driver's photo — can never be overwritten by an upload. With a
    //   random UUID that should never happen; this makes it impossible rather
    //   than improbable, which is what "a photo stays on its own page" needs.
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`

    try {
      await mkdir(dirname(file), { recursive: true })
      await writeFile(temporary, buffer, { flag: 'wx', mode: 0o644 })
      await link(temporary, file)
    } catch (error) {
      this.logger.error(`Media upload failed: ${(error as Error).message}`, (error as Error).stack)
      throw new InternalServerErrorException(UPLOAD_FAILED_MESSAGE)
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined)
    }

    return { path, url: `${this.publicUrl}/${path}` }
  }

  /**
   * Idempotent: a file that is already gone counts as removed, so the nightly
   * purge can always finish the job a previous run started.
   */
  async remove(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    this.assertWritable()

    const results = await Promise.allSettled(
      paths.map(async (path) => rm(this.fileFor(path), { force: true })),
    )
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    if (failures.length > 0) {
      this.logger.error(
        `Media removal failed for ${failures.length}/${paths.length} file(s): ` +
          failures.map((failure) => String(failure.reason?.message ?? failure.reason)).join('; '),
      )
      throw new InternalServerErrorException(REMOVAL_FAILED_MESSAGE)
    }
  }
}
