import { Module } from '@nestjs/common'
import { StorageModule } from '../storage/storage.module'
import { ImageProcessorService } from './image-processor.service'
import { ImagesController } from './images.controller'
import { ImagesRepository } from './images.repository'
import { ImagesService } from './images.service'

@Module({
  imports: [StorageModule],
  controllers: [ImagesController],
  providers: [ImagesService, ImageProcessorService, ImagesRepository],
  exports: [ImagesService, ImagesRepository],
})
export class ImagesModule {}
