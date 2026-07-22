import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ImagesService, UploadedImageDto } from './images.service'

// Keep in sync with MAX_UPLOAD_BYTES in image-processor.service.ts.
// Rejecting oversized files at the multer layer avoids buffering them into
// memory before the size check in ImageProcessorService ever runs.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(@UploadedFile() file?: Express.Multer.File): Promise<UploadedImageDto> {
    if (!file) {
      throw new BadRequestException('File is required (multipart field "file")')
    }
    return this.imagesService.upload(file)
  }
}
