import { Injectable, NotFoundException } from '@nestjs/common'
import { toTowTruckApi } from '../tow-trucks/tow-truck.mapper'
import type { TowTruckApi } from '../tow-trucks/tow-truck.types'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import type { UpdateMyTowTruckDto } from './dto/update-my-tow-truck.dto'

@Injectable()
export class MyTowTruckService {
  constructor(private readonly towTrucksRepository: TowTrucksRepository) {}

  async getMine(towTruckId: number): Promise<TowTruckApi> {
    const towTruck = await this.towTrucksRepository.findById(towTruckId)
    if (!towTruck) throw new NotFoundException('Profile not found')
    return toTowTruckApi(towTruck)
  }

  async updateMine(towTruckId: number, dto: UpdateMyTowTruckDto): Promise<TowTruckApi> {
    const updated = await this.towTrucksRepository.updateOwnProfile(towTruckId, dto)
    return toTowTruckApi(updated)
  }
}
