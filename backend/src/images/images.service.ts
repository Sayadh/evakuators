import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import type { TowTruckImage } from '@prisma/client'
import { SupabaseStorageService } from '../storage/supabase-storage.service'
import { ImageProcessorService } from './image-processor.service'
import { ImagesRepository } from './images.repository'

export interface UploadedImageDto {
  id: number
  url: string
  width: number
  height: number
}

/**
 * How long an unattached upload is kept before it counts as abandoned. Generous
 * on purpose: a driver can legitimately spend a long time on the registration
 * form between picking photos and submitting it.
 */
const UNATTACHED_IMAGE_TTL_MS = 24 * 60 * 60 * 1000

/**
 * How long a rejected application's photos are kept after the rejection, in case
 * an admin rejects by mistake and wants to look at them again.
 */
const REJECTED_IMAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name)

  constructor(
    private readonly imagesRepository: ImagesRepository,
    private readonly processor: ImageProcessorService,
    private readonly storage: SupabaseStorageService,
  ) {}

  /** Full pipeline: validate → Sharp → WebP → Supabase Storage → DB record */
  async upload(file: Express.Multer.File): Promise<UploadedImageDto> {
    const processed = await this.processor.process(file)
    const stored = await this.storage.uploadWebp(processed.buffer, 'uploads')

    const record = await this.imagesRepository.create({
      path: stored.path,
      url: stored.url,
      width: processed.width,
      height: processed.height,
      sizeBytes: processed.sizeBytes,
    })

    return this.toDto(record)
  }

  /**
   * Daily cleanup of images that belong to nothing — see
   * `ImagesRepository.findOrphaned()` for what qualifies and why.
   *
   * This closes the only unbounded-cost path in the system: `POST /images` is
   * public (it has to be — it runs before a driver has any credentials), accepts
   * 10MB files, and previously nothing ever removed an upload that wasn't
   * followed by a submitted and approved registration.
   *
   * Storage is deleted BEFORE the database rows, deliberately. The `path` column
   * is the only record of which bucket object belongs to which row, so deleting
   * the row first would strand the file with no way left to find it. If the
   * Storage call fails, the rows stay and the next run retries them.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOrphanedImages(): Promise<void> {
    const now = Date.now()
    const orphaned = await this.imagesRepository.findOrphaned(
      new Date(now - UNATTACHED_IMAGE_TTL_MS),
      new Date(now - REJECTED_IMAGE_TTL_MS),
    )
    if (orphaned.length === 0) return

    try {
      await this.storage.remove(orphaned.map((image) => image.path))
    } catch (error) {
      // Leave the rows in place so the next run tries again — dropping them now
      // would orphan the bucket objects permanently (nothing else records their
      // paths), which is the exact problem this job exists to fix.
      this.logger.warn(
        `Orphaned-image purge: Storage delete failed, keeping ${orphaned.length} rows for the next run: ${String(error)}`,
      )
      return
    }

    const deleted = await this.imagesRepository.deleteByIds(orphaned.map((image) => image.id))
    const bytes = orphaned.reduce((sum, image) => sum + image.sizeBytes, 0)
    this.logger.log(
      `Orphaned-image purge: removed ${deleted} images (${Math.round(bytes / 1024)} KB) from Storage and the database`,
    )
  }

  private toDto(record: TowTruckImage): UploadedImageDto {
    return { id: record.id, url: record.url, width: record.width, height: record.height }
  }
}
