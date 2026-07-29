import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ImagesRepository } from '../images/images.repository'
import { AVAILABLE_24_7_SLUG } from '../tow-trucks/service-slugs'
import { toTowTruckApi } from '../tow-trucks/tow-truck.mapper'
import type { TowTruckApi } from '../tow-trucks/tow-truck.types'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import type { UpdateMyTowTruckDto } from './dto/update-my-tow-truck.dto'

/**
 * Note there is no SupabaseStorageService here any more. This service used to
 * delete bucket objects itself when a driver removed a photo; it now only
 * detaches the row and lets `ImagesService.purgeOrphanedImages` do the actual
 * deletion, so Storage has exactly one owner instead of two with different
 * failure handling. See the comment in updateMine().
 */
@Injectable()
export class MyTowTruckService {
  constructor(
    private readonly towTrucksRepository: TowTrucksRepository,
    private readonly imagesRepository: ImagesRepository,
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

    // `imageIds` is the full replacement gallery, in display order — omitted
    // means "leave the photos alone", which is why this whole block is guarded
    // rather than treating an absent field as an empty list.
    if (imageIds !== undefined) {
      const currentImages = await this.imagesRepository.findByTowTruckId(towTruckId)
      const currentImageIds = currentImages.map((i) => i.id)

      const removedIds = currentImages.filter((i) => !imageIds.includes(i.id)).map((i) => i.id)
      const newImageIds = imageIds.filter((id) => !currentImageIds.includes(id))

      // Anything not already ours must be a fresh, unclaimed upload — this is
      // what stops one driver from pulling another driver's photo (or an
      // already-attached one) into their own gallery by id.
      if (newImageIds.length > 0) {
        const available = await this.imagesRepository.findUnattachedByIds(newImageIds)
        if (available.length !== newImageIds.length) {
          throw new BadRequestException('Նկարներից մեկը կամ մի քանիսը վավեր չեն կամ արդեն օգտագործված են։')
        }
      }

      // Detach first, then apply: an image the driver dropped must be out of
      // the gallery before positions are renumbered, or it would keep a
      // position in a list it no longer belongs to.
      //
      // Detach, NOT delete. The nightly orphan purge (ImagesService) owns
      // Storage deletion and is the only place that gets the ordering right —
      // Storage object first, DB row only after it succeeded. Deleting the row
      // here would discard `path` while the file is still in the bucket, and a
      // transient Supabase failure would then leak it permanently with nothing
      // left to find it by. This is the exact leak that used to happen here.
      await this.imagesRepository.detachFromTowTruck(removedIds)
      await this.imagesRepository.applyGallery(imageIds, towTruckId)
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
