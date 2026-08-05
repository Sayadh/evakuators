import { ForbiddenException, Injectable, InternalServerErrorException } from '@nestjs/common'
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

/**
 * The ONLY place in the whole project that talks to Supabase.
 * Uses Supabase Storage exclusively — never its Database or Auth.
 */
@Injectable()
export class SupabaseStorageService {
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
      throw new ForbiddenException(
        'Image storage is read-only in this environment (SUPABASE_STORAGE_READ_ONLY) — uploads and deletions are disabled.',
      )
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
      throw new InternalServerErrorException(`Image upload failed: ${error.message}`)
    }

    const { data } = this.client.storage.from(this.bucket).getPublicUrl(path)
    return { path, url: data.publicUrl }
  }

  async remove(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    this.assertWritable()
    const { error } = await this.client.storage.from(this.bucket).remove(paths)
    if (error) {
      throw new InternalServerErrorException(`Image removal failed: ${error.message}`)
    }
  }
}
