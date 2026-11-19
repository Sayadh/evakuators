import { Controller, Get, Param, Query } from '@nestjs/common'
import { ListTowTrucksQuery } from './dto/list-tow-trucks.query'
import type {
  TowTruckApi,
  TowTruckCardApi,
  TowTruckCoverageApi,
  TowTruckInactivePlacementApi,
} from './tow-truck.types'
import { TowTrucksService } from './tow-trucks.service'

@Controller('tow-trucks')
export class TowTrucksController {
  constructor(private readonly towTrucksService: TowTrucksService) {}

  /** Card shape, not the full profile — see TowTruckCardApi */
  @Get()
  list(@Query() query: ListTowTrucksQuery): Promise<TowTruckCardApi[]> {
    return this.towTrucksService.list(query)
  }

  // The static path must come before ':slug' — otherwise Nest would match
  // "coverage" as a slug.
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

  /**
   * Lets the profile page send a deactivated driver's visitors to the listing
   * of the same area. Geography and vehicle type only, no contact details.
   */
  @Get(':slug/inactive-placement')
  getInactivePlacement(
    @Param('slug') slug: string,
  ): Promise<{ placement: TowTruckInactivePlacementApi | null }> {
    return this.towTrucksService.getInactivePlacement(slug)
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string): Promise<TowTruckApi> {
    return this.towTrucksService.getBySlug(slug)
  }
}
