import { Module } from '@nestjs/common'
import { TowTrucksController } from './tow-trucks.controller'
import { TowTrucksRepository } from './tow-trucks.repository'
import { TowTrucksService } from './tow-trucks.service'

@Module({
  controllers: [TowTrucksController],
  providers: [TowTrucksService, TowTrucksRepository],
  exports: [TowTrucksService, TowTrucksRepository],
})
export class TowTrucksModule {}
