import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import sharp from 'sharp'

export interface ProcessedImage {
  buffer: Buffer
  width: number
  height: number
  sizeBytes: number
}

// Keep in sync with MAX_UPLOAD_BYTES in images.controller.ts.
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024
const MAX_DIMENSION = 1600
const WEBP_QUALITY = 82

/** Derived, never hardcoded — the message used to claim 10 MB while the limit was 30 */
const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))

/**
 * Formats sharp reports for input we accept, as `metadata.format` spells them.
 * Note `heif`, not `heic`: sharp normalizes the whole HEIF family (including
 * iPhone's .heic) to that one name.
 */
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif'])

/**
 * Whether THIS sharp build can actually decode HEIF/HEIC.
 *
 * Support depends on libheif being compiled into the prebuilt binary, which
 * varies by platform and sharp version — so it is probed at boot rather than
 * assumed. The old code listed `image/heic` as accepted unconditionally and,
 * on a build without it, answered "this file is not a valid image" — which is
 * both wrong and unactionable for the driver who just picked a photo straight
 * out of an iPhone camera roll.
 */
const HEIF_SUPPORTED = Boolean(sharp.format.heif?.input?.buffer)

/**
 * Validates and normalizes every uploaded image:
 * probe → format check → decode → auto-rotate (EXIF) → resize → WebP.
 */
@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name)

  constructor() {
    if (!HEIF_SUPPORTED) {
      // Worth a boot-time line: on a server without it, every iPhone upload
      // that wasn't already converted by Safari will be rejected, and that is
      // a property of the deployment, not of the code.
      this.logger.warn(
        'This sharp build cannot decode HEIF/HEIC — uploads in that format will be rejected with a specific message.',
      )
    }
  }

  async process(file: Express.Multer.File): Promise<ProcessedImage> {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(`Նկարը շատ մեծ է (առավելագույնը՝ ${MAX_UPLOAD_MB} ՄԲ)`)
    }

    // Read the real format out of the file's own bytes. The previous check
    // used `file.mimetype`, which is just the Content-Type the client typed
    // into the multipart part — it says nothing about what was actually sent.
    let format: string | undefined
    try {
      format = (await sharp(file.buffer).metadata()).format
    } catch {
      throw new BadRequestException(this.undecodableMessage(file))
    }

    if (!format || !ALLOWED_FORMATS.has(format)) {
      throw new BadRequestException(
        'Թույլատրվում են միայն JPEG, PNG, WebP կամ HEIC ձևաչափի նկարներ',
      )
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
      throw new BadRequestException('Ֆայլը վավեր նկար չէ')
    }

    const metadata = await sharp(output).metadata()

    return {
      buffer: output,
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      sizeBytes: output.byteLength,
    }
  }

  /**
   * A HEIC file on a build without libheif fails to probe exactly like a
   * corrupt file does, so the generic "not a valid image" is indistinguishable
   * from "your phone's photo format isn't supported here". The declared
   * mimetype is untrustworthy as *validation*, but it is a perfectly good hint
   * for choosing which error to show.
   */
  private undecodableMessage(file: Express.Multer.File): string {
    const looksHeic = /image\/(heic|heif)/i.test(file.mimetype)
    if (looksHeic && !HEIF_SUPPORTED) {
      return (
        'Այս նկարը HEIC ձևաչափի է (iPhone-ի ստանդարտ ձևաչափը), որը չի աջակցվում։ ' +
        'iPhone-ում բացեք Settings → Camera → Formats և ընտրեք «Most Compatible», ' +
        'կամ ուղարկեք նկարը JPG ձևաչափով։'
      )
    }
    return 'Ֆայլը վավեր նկար չէ'
  }
}
