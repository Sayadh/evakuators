import { Module } from '@nestjs/common'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { NearestCacheService } from './nearest-cache.service'
import { NearestController } from './nearest.controller'
import { NearestRepository } from './nearest.repository'
import { NearestService } from './nearest.service'
import { RouteMatrixService } from './route-matrix.service'

/**
 * The "nearest evacuator" search.
 *
 * Depends on `TowTrucksModule` for `TowTrucksService` only — so the cards this
 * feature returns are built by the same code path as every other listing,
 * ratings and all. One-directional: nothing in `tow-trucks` knows this module
 * exists, which is what keeps the whole feature deletable by removing this
 * folder and one line in `app.module.ts` (the same property `analytics` has).
 */
@Module({
  imports: [TowTrucksModule],
  controllers: [NearestController],
  providers: [NearestService, NearestRepository, RouteMatrixService, NearestCacheService],
})
export class NearestModule {}
