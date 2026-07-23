import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { CreateReviewDto } from './dto/create-review.dto'
import { ReviewApi, ReviewsService } from './reviews.service'

@Controller('tow-trucks/:towTruckId/reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  list(@Param('towTruckId', ParseIntPipe) towTruckId: number): Promise<ReviewApi[]> {
    return this.reviewsService.listForTowTruck(towTruckId)
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  create(
    @Param('towTruckId', ParseIntPipe) towTruckId: number,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewApi> {
    return this.reviewsService.create(towTruckId, dto)
  }
}
