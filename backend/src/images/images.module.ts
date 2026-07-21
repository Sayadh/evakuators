import { Module } from '@nestjs/common'
import { StorageModule } from '../storage/storage.module'
import { ImageProcessorService } from './image-processor.service'
import { ImagesController } from './images.controller'
import { ImagesService } from './images.service'

@Module({
  imports: [StorageModule],
  controllers: [ImagesController],
  providers: [ImagesService, ImageProcessorService],
  exports: [ImagesService],
})
export class ImagesModule {}
