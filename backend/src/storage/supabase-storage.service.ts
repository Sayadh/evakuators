import { Injectable, InternalServerErrorException } from '@nestjs/common'
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

  constructor(config: ConfigService) {
    const supabase = config.getOrThrow<AppConfig['supabase']>('supabase')
    this.bucket = supabase.bucket
    this.client = createClient(supabase.url, supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocket as never },
    })
  }

  async uploadWebp(buffer: Buffer, folder: string): Promise<StoredObject> {
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
    const { error } = await this.client.storage.from(this.bucket).remove(paths)
    if (error) {
      throw new InternalServerErrorException(`Image removal failed: ${error.message}`)
    }
  }
}
