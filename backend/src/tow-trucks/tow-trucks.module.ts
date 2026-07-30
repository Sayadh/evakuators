import { Module } from '@nestjs/common'
import { ReviewsModule } from '../reviews/reviews.module'
import { TowTrucksController } from './tow-trucks.controller'
import { TowTrucksRepository } from './tow-trucks.repository'
import { TowTrucksService } from './tow-trucks.service'

@Module({
  // For ReviewsRepository only — the listing attaches each card's approved
  // review aggregate. One-directional: ReviewsModule knows nothing about this
  // module, so there is no cycle.
  imports: [ReviewsModule],
  controllers: [TowTrucksController],
  providers: [TowTrucksService, TowTrucksRepository],
  exports: [TowTrucksService, TowTrucksRepository],
})
export class TowTrucksModule {}
