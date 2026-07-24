import { Injectable, NotFoundException } from '@nestjs/common'
import type { ListTowTrucksQuery } from './dto/list-tow-trucks.query'
import { toTowTruckApi } from './tow-truck.mapper'
import type { TowTruckApi } from './tow-truck.types'
import { TowTrucksRepository } from './tow-trucks.repository'

@Injectable()
export class TowTrucksService {
  constructor(private readonly repository: TowTrucksRepository) {}

  async list(query: ListTowTrucksQuery): Promise<TowTruckApi[]> {
    const trucks = await this.repository.findMany({
      citySlug: query.city,
      districtSlug: query.district,
      regionSlug: query.region,
      regionCitySlugs: query.regionCities,
      yerevan: query.yerevan,
      limit: query.limit,
    })
    return trucks.map(toTowTruckApi)
  }

  async getBySlug(slug: string): Promise<TowTruckApi> {
    const truck = await this.repository.findBySlug(slug)
    if (!truck) {
      throw new NotFoundException('Էվակուատորը չի գտնվել')
    }
    return toTowTruckApi(truck)
  }

  /** Admin-curated picks — empty array when the admin hasn't marked any */
  async getFeatured(): Promise<TowTruckApi[]> {
    const trucks = await this.repository.findFeatured()
    return trucks.map(toTowTruckApi)
  }
}
