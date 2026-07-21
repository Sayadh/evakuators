import { BadRequestException, Injectable } from '@nestjs/common'
import sharp from 'sharp'

export interface ProcessedImage {
  buffer: Buffer
  width: number
  height: number
  sizeBytes: number
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_DIMENSION = 1600
const WEBP_QUALITY = 82
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])

/**
 * Validates and normalizes every uploaded image:
 * mime + size check → decode → auto-rotate (EXIF) → resize → WebP.
 */
@Injectable()
export class ImageProcessorService {
  async process(file: Express.Multer.File): Promise<ProcessedImage> {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, WebP or HEIC images are allowed')
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Image is too large (max 10 MB)')
    }

    let output: Buffer
    try {
      output = await sharp(file.buffer, { failOn: 'error' })
        .rotate() // honor EXIF orientation
        .resize({
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer()
    } catch {
      throw new BadRequestException('File is not a valid image')
    }

    const metadata = await sharp(output).metadata()

    return {
      buffer: output,
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      sizeBytes: output.byteLength,
    }
  }
}
