import { Controller, Get, Param, Query } from '@nestjs/common'
import { ListTowTrucksQuery } from './dto/list-tow-trucks.query'
import type { TowTruckApi } from './tow-truck.types'
import { TowTrucksService } from './tow-trucks.service'

@Controller('tow-trucks')
export class TowTrucksController {
  constructor(private readonly towTrucksService: TowTrucksService) {}

  @Get()
  list(@Query() query: ListTowTrucksQuery): Promise<TowTruckApi[]> {
    return this.towTrucksService.list(query)
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string): Promise<TowTruckApi> {
    return this.towTrucksService.getBySlug(slug)
  }
}
