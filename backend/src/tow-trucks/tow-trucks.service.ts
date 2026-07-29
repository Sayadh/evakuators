import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import type { ListTowTrucksQuery } from './dto/list-tow-trucks.query'
import { toTowTruckApi, toTowTruckCardApi, toTowTruckCoverageApi } from './tow-truck.mapper'
import type { TowTruckApi, TowTruckCardApi, TowTruckCoverageApi } from './tow-truck.types'
import { TOW_TRUCK_LIST_DEFAULT_LIMIT } from './tow-trucks.constants'
import { TowTrucksRepository } from './tow-trucks.repository'

@Injectable()
export class TowTrucksService {
  private readonly logger = new Logger(TowTrucksService.name)

  constructor(private readonly repository: TowTrucksRepository) {}

  async list(query: ListTowTrucksQuery): Promise<TowTruckCardApi[]> {
    const limit = query.limit ?? TOW_TRUCK_LIST_DEFAULT_LIMIT

    const trucks = await this.repository.findManyCards({
      citySlug: query.city,
      districtSlug: query.district,
      regionSlug: query.region,
      regionCitySlugs: query.regionCities,
      yerevan: query.yerevan,
      limit,
      offset: query.offset,
    })

    // Tripwire, not an error: the frontend filters this list client-side, which
    // is only correct while one geography's trucks fit in one response. The day
    // a real query hits the cap, this warning is what says filtering and
    // pagination have to move to the backend — see tow-trucks.constants.ts.
    if (trucks.length === limit) {
      this.logger.warn(
        `Tow truck listing hit the ${limit}-row cap ` +
          `(city=${query.city ?? '-'} district=${query.district ?? '-'} region=${query.region ?? '-'}). ` +
          'Client-side filtering is now hiding results — move filtering/pagination server-side.',
      )
    }

    return trucks.map(toTowTruckCardApi)
  }

  /**
   * Geography footprint of every active truck, for the region/city/district
   * counters. See `TowTruckCoverageApi` for why this returns per-truck records
   * rather than ready-made counts.
   */
  async getCoverage(): Promise<TowTruckCoverageApi[]> {
    const trucks = await this.repository.findCoverage()
    return trucks.map(toTowTruckCoverageApi)
  }

  async getBySlug(slug: string): Promise<TowTruckApi> {
    const truck = await this.repository.findBySlug(slug)
    if (!truck) {
      throw new NotFoundException('Էվակուատորը չի գտնվել')
    }
    return toTowTruckApi(truck)
  }

  /** Admin-curated picks — empty array when the admin hasn't marked any */
  async getFeatured(): Promise<TowTruckCardApi[]> {
    const trucks = await this.repository.findFeaturedCards()
    return trucks.map(toTowTruckCardApi)
  }
}
