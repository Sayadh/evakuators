import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ImagesService, UploadedImageDto } from './images.service'

@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file?: Express.Multer.File): Promise<UploadedImageDto> {
    if (!file) {
      throw new BadRequestException('File is required (multipart field "file")')
    }
    return this.imagesService.upload(file)
  }
}
