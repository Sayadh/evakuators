import { Module } from '@nestjs/common'
import { ReviewsController } from './reviews.controller'
import { ReviewsRepository } from './reviews.repository'
import { ReviewsService } from './reviews.service'

@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewsRepository],
  exports: [ReviewsRepository],
})
export class ReviewsModule {}
