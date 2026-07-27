import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ImagesRepository } from '../images/images.repository'
import { SupabaseStorageService } from '../storage/supabase-storage.service'
import { AVAILABLE_24_7_SLUG } from '../tow-trucks/service-slugs'
import { toTowTruckApi } from '../tow-trucks/tow-truck.mapper'
import type { TowTruckApi } from '../tow-trucks/tow-truck.types'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import type { UpdateMyTowTruckDto } from './dto/update-my-tow-truck.dto'

@Injectable()
export class MyTowTruckService {
  private readonly logger = new Logger(MyTowTruckService.name)

  constructor(
    private readonly towTrucksRepository: TowTrucksRepository,
    private readonly imagesRepository: ImagesRepository,
    private readonly storage: SupabaseStorageService,
  ) {}

  async getMine(towTruckId: number): Promise<TowTruckApi> {
    const towTruck = await this.towTrucksRepository.findById(towTruckId)
    if (!towTruck) throw new NotFoundException('Ձեր պրոֆիլը չի գտնվել')
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

    const { imageIds, ...updateData } = dto

    // Handle images if provided
    if (imageIds !== undefined) {
      const currentImages = await this.imagesRepository.findByTowTruckId(towTruckId)
      const currentImageIds = currentImages.map((i) => i.id)

      const removedImages = currentImages.filter((i) => !imageIds.includes(i.id))
      const newImageIds = imageIds.filter((id) => !currentImageIds.includes(id))

      if (newImageIds.length > 0) {
        const available = await this.imagesRepository.findUnattachedByIds(newImageIds)
        if (available.length !== newImageIds.length) {
          throw new BadRequestException('Նկարներից մեկը կամ մի քանիսը վավեր չեն կամ արդեն օգտագործված են։')
        }
        await this.imagesRepository.attachToTowTruck(newImageIds, towTruckId)
      }

      if (removedImages.length > 0) {
        await this.imagesRepository.deleteByIds(removedImages.map((i) => i.id))
        try {
          await this.storage.remove(removedImages.map((image) => image.path))
        } catch (error) {
          this.logger.warn(`Failed to remove Storage objects for TowTruck ${towTruckId}: ${String(error)}`)
        }
      }
    }

    // works24Hours is derived, not directly editable — see service-slugs.ts.
    // Only touch it when services are actually part of this update. The
    // dashboard always sends both together, and UpdateMyTowTruckDto's
    // @ValidateIf already guarantees workingHoursText is a properly
    // formatted, non-empty string whenever 24/7 isn't selected.
    const data = {
      ...updateData,
      ...(updateData.services ? { works24Hours: updateData.services.includes(AVAILABLE_24_7_SLUG) } : {}),
    }

    const updated = await this.towTrucksRepository.updateOwnProfile(towTruckId, data)
    return toTowTruckApi(updated)
  }
}
