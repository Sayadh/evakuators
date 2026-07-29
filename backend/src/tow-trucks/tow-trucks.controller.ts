import { Controller, Get, Param, Query } from '@nestjs/common'
import { ListTowTrucksQuery } from './dto/list-tow-trucks.query'
import type { TowTruckApi, TowTruckCardApi, TowTruckCoverageApi } from './tow-truck.types'
import { TowTrucksService } from './tow-trucks.service'

@Controller('tow-trucks')
export class TowTrucksController {
  constructor(private readonly towTrucksService: TowTrucksService) {}

  /** Card shape, not the full profile — see TowTruckCardApi */
  @Get()
  list(@Query() query: ListTowTrucksQuery): Promise<TowTruckCardApi[]> {
    return this.towTrucksService.list(query)
  }

  // Both static paths must come before ':slug' — otherwise Nest would match
  // "featured" / "coverage" as a slug.
  @Get('featured')
  getFeatured(): Promise<TowTruckCardApi[]> {
    return this.towTrucksService.getFeatured()
  }

  /**
   * Minimal per-truck geography footprint, for the region/city/district
   * counters on the browse pages. Exists so those pages stop downloading the
   * whole fleet — with every driver's contact details — just to render
   * "3 էվակուատոր". See TowTruckCoverageApi.
   */
  @Get('coverage')
  getCoverage(): Promise<TowTruckCoverageApi[]> {
    return this.towTrucksService.getCoverage()
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string): Promise<TowTruckApi> {
    return this.towTrucksService.getBySlug(slug)
  }
}
