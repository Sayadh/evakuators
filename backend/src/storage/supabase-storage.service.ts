import { ForbiddenException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SupabaseClient, createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
// supabase-js always spins up a Realtime client internally, which needs a
// WebSocket implementation. Node < 22 has no native WebSocket, so we hand it
// the `ws` polyfill explicitly — we never use Realtime (Storage only), but
// without this the client constructor throws and crashes the app on boot.
import WebSocket from 'ws'
import type { AppConfig } from '../config/configuration'

export interface StoredObject {
  /** Object path inside the bucket */
  path: string
  /** Public URL */
  url: string
}

const UPLOAD_FAILED_MESSAGE = 'Նկարի բեռնումը ձախողվեց, փորձեք կրկին'
const REMOVAL_FAILED_MESSAGE = 'Նկարի ջնջումը ձախողվեց, փորձեք կրկին'

/**
 * The ONLY place in the whole project that talks to Supabase.
 * Uses Supabase Storage exclusively — never its Database or Auth.
 */
@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name)
  private readonly client: SupabaseClient
  private readonly bucket: string
  /**
   * See `SUPABASE_STORAGE_READ_ONLY` in env.validation.ts and configuration.ts
   * for what sets this. Exists for a deploy that deliberately points at
   * production's real bucket for read-only display — a staging environment
   * (docs/deployment.md § "Staging environment") that was explicitly asked
   * NOT to test uploads. Every existing image on such a deploy still displays
   * fine: the URLs stored in its (copied) database rows are absolute Supabase
   * Storage URLs, served directly by Supabase regardless of which app is
   * rendering the page that links to them. Only WRITES go through this class,
   * which is why blocking them here is enough — there is no code path that
   * reads an image through `SupabaseStorageService`.
   */
  private readonly writesDisabled: boolean

  constructor(config: ConfigService) {
    const supabase = config.getOrThrow<AppConfig['supabase']>('supabase')
    this.bucket = supabase.bucket
    this.writesDisabled = supabase.writesDisabled
    this.client = createClient(supabase.url, supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocket as never },
    })
  }

  /**
   * Throws BEFORE either write method touches the network — a caller that
   * ignored the error (there isn't one, but the next one might) still can't
   * end up with a DB row pointing at an object that was never actually
   * written, because the write attempt never happens at all.
   */
  private assertWritable(): void {
    if (this.writesDisabled) {
      // Staging only (docs/deployment.md § "Staging environment") — but the
      // message still has to be one a real person can read if they ever hit
      // it while testing, not the English env-var name that used to be here.
      throw new ForbiddenException('Այս միջավայրում նկարների բեռնումն ու ջնջումն անջատված են')
    }
  }

  async uploadWebp(buffer: Buffer, folder: string): Promise<StoredObject> {
    this.assertWritable()
    const path = `${folder}/${randomUUID()}.webp`

    const { error } = await this.client.storage.from(this.bucket).upload(path, buffer, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    })

    if (error) {
      // The real Supabase error (bucket/network/quota detail) is for the logs
      // only — never send raw third-party provider text to a driver, and
      // AllExceptionsFilter can't help here since this exception is thrown
      // with a message already, not left to fall through to it.
      this.logger.error(`Supabase Storage upload failed: ${error.message}`, error.stack)
      throw new InternalServerErrorException(UPLOAD_FAILED_MESSAGE)
    }

    const { data } = this.client.storage.from(this.bucket).getPublicUrl(path)
    return { path, url: data.publicUrl }
  }

  async remove(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    this.assertWritable()
    const { error } = await this.client.storage.from(this.bucket).remove(paths)
    if (error) {
      this.logger.error(`Supabase Storage removal failed: ${error.message}`, error.stack)
      throw new InternalServerErrorException(REMOVAL_FAILED_MESSAGE)
    }
  }
}
