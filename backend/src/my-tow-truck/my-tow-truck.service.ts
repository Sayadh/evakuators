import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { AVAILABLE_24_7_SLUG } from '../tow-trucks/service-slugs'
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
    // The JWT itself never expires early — if admin deactivates a driver
    // (ban / removed from platform) their still-valid 30-day token must
    // stop working immediately, not just disappear from the public listing.
    if (!towTruck.isActive) {
      throw new ForbiddenException('Ձեր պրոֆիլն ապաակտիվացված է, դիմեք admin-ին')
    }
    return toTowTruckApi(towTruck)
  }

  async updateMine(towTruckId: number, dto: UpdateMyTowTruckDto): Promise<TowTruckApi> {
    await this.getMine(towTruckId) // reuses the isActive + existence check above

    // works24Hours is derived, not directly editable — see service-slugs.ts.
    // Only touch it when services are actually part of this update.
    const data = {
      ...dto,
      ...(dto.services ? { works24Hours: dto.services.includes(AVAILABLE_24_7_SLUG) } : {}),
    }

    const updated = await this.towTrucksRepository.updateOwnProfile(towTruckId, data)
    return toTowTruckApi(updated)
  }
}
