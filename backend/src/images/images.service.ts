import { Injectable } from '@nestjs/common'
import type { TowTruckImage } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { SupabaseStorageService } from '../storage/supabase-storage.service'
import { ImageProcessorService } from './image-processor.service'

export interface UploadedImageDto {
  id: number
  url: string
  width: number
  height: number
}

@Injectable()
export class ImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: ImageProcessorService,
    private readonly storage: SupabaseStorageService,
  ) {}

  /** Full pipeline: validate → Sharp → WebP → Supabase Storage → DB record */
  async upload(file: Express.Multer.File): Promise<UploadedImageDto> {
    const processed = await this.processor.process(file)
    const stored = await this.storage.uploadWebp(processed.buffer, 'uploads')

    const record = await this.prisma.towTruckImage.create({
      data: {
        path: stored.path,
        url: stored.url,
        width: processed.width,
        height: processed.height,
        sizeBytes: processed.sizeBytes,
      },
    })

    return this.toDto(record)
  }

  private toDto(record: TowTruckImage): UploadedImageDto {
    return { id: record.id, url: record.url, width: record.width, height: record.height }
  }
}
