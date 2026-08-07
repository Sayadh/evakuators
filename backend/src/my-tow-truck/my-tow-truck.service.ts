import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { assertWithinArmenia } from '../common/coordinates'
import type { SetCoordinatesDto } from '../common/set-coordinates.dto'
import { ImagesRepository } from '../images/images.repository'
import { AVAILABLE_24_7_SLUG } from '../tow-trucks/service-slugs'
import { toTowTruckApi } from '../tow-trucks/tow-truck.mapper'
import type { TowTruckApi } from '../tow-trucks/tow-truck.types'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import type { UpdateMyTowTruckDto } from './dto/update-my-tow-truck.dto'
import { assertServiceAreasWithinLimit } from '../tow-trucks/service-area-limits'

/**
 * Note there is no SupabaseStorageService here any more. This service used to
 * delete bucket objects itself when a driver removed a photo; it now only
 * detaches the row and lets `ImagesService.purgeOrphanedImages` do the actual
 * deletion, so Storage has exactly one owner instead of two with different
 * failure handling. See the comment in updateMine().
 */
/**
 * Turns the optional contact fields into Prisma update input, mapping a
 * trimmed-empty value to `null` and leaving an omitted key out entirely.
 *
 * Split out so the same rule applies to all of them by construction: the
 * previous version handled `companyName` inline and silently left the other
 * four unclearable.
 */
function clearable(fields: Record<string, string | undefined>): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, (value as string).trim() || null]),
  )
}

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
    // The driver's own profile is the one place the exact coordinates belong in
    // a response — the dashboard has to show them back before they can be
    // edited. The public `GET /tow-trucks/:slug` calls the same mapper without
    // this flag and therefore never carries them; see tow-truck.mapper.ts.
    return toTowTruckApi(towTruck, { includeCoordinates: true })
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

    // `regionSlugs` is pulled out here on purpose: `rest` is spread straight
    // into Prisma's update input, and TowTruck has no such column — leaving it
    // in would turn every dashboard save into an unknown-argument error. It
    // exists only to tell the coverage cap one marz from two, and is never
    // stored (see UpdateMyTowTruckDto).
    const {
      serviceAreas,
      regionSlugs,
      companyName,
      secondaryPhone,
      whatsapp,
      telegram,
      email,
      ...rest
    } = updateData

    // Coverage is one decision, not four independent fields: the JSON list the
    // public profile renders and the citySlug/districtSlug/regionSlug the
    // browsing pages filter on have to describe the same geography. Accepting
    // one without the other is how a truck ends up listed in a city it no
    // longer serves, so the combination is rejected outright instead.
    if (serviceAreas !== undefined && !rest.citySlug && !rest.districtSlug) {
      throw new BadRequestException(
        'Սպասարկվող տարածքները փոխելիս պետք է նշվի նաև հիմնական քաղաքը կամ շրջանը։',
      )
    }

    // The exact coverage rule. Applied only when the driver is actually
    // changing their areas — omitting the key leaves the stored list alone, so
    // a driver approved before the cap existed keeps their coverage and is
    // asked to trim it the first time they touch it, not retroactively.
    if (serviceAreas !== undefined) {
      assertServiceAreasWithinLimit(serviceAreas, regionSlugs)
    }

    const data: Prisma.TowTruckUpdateInput = {
      ...rest,

      // Empty means "clear it", not "skip it", for every optional free-text
      // contact field — a driver must be able to take a value back OUT of a box
      // they filled in by mistake, or that stopped being true.
      //
      // This was `companyName` alone for a while, and the gap showed: a driver
      // who stopped using WhatsApp could not remove it, so the card kept
      // offering a chat nobody read. Omitting the key means "leave it alone",
      // which is the right default for a PATCH — but then there has to be some
      // value that means "remove", and for a text field that value is "".
      ...clearable({ companyName, secondaryPhone, whatsapp, telegram, email }),

      // Yerevan is a pseudo-region with no regionSlug (see CLAUDE.md), so a
      // truck moving into or out of Yerevan has to be able to null the
      // opposite half of the pair — `?? null` rather than a spread guard.
      ...(serviceAreas !== undefined
        ? {
            // Mapped to plain objects, not passed through as DTO instances —
            // Prisma's InputJsonValue rejects class instances. Same shape and
            // same reason as AdminService.approve().
            serviceAreas: serviceAreas.map((area) => ({
              slug: area.slug,
              name: area.name,
              type: area.type,
            })) satisfies Prisma.InputJsonValue,
            regionSlug: rest.regionSlug ?? null,
            citySlug: rest.citySlug ?? null,
            districtSlug: rest.districtSlug ?? null,
          }
        : {}),

      // works24Hours is derived, not directly editable — see service-slugs.ts.
      // Only touch it when services are actually part of this update.
      ...(rest.services ? { works24Hours: rest.services.includes(AVAILABLE_24_7_SLUG) } : {}),
    }

    const updated = await this.towTrucksRepository.updateOwnProfile(towTruckId, data)
    return toTowTruckApi(updated, { includeCoordinates: true })
  }

  /**
   * The driver's own base parking coordinates.
   *
   * ## Why a separate endpoint rather than two more fields on updateMine()
   *
   * The dashboard edits these in a dialog with its own Save button, separate
   * from the big profile form — so the request that saves them should be
   * separate too. Folding them into the profile PATCH would mean the dialog
   * either resubmits the whole form (and saves whatever half-edited state
   * happened to be sitting in it) or sends a two-key PATCH to an endpoint whose
   * DTO accepts thirty other columns. `SetCoordinatesDto` has exactly two
   * fields, so this request cannot touch anything else even in principle —
   * which is the mass-assignment guarantee, structurally rather than by review.
   *
   * It also keeps the driver and admin paths symmetric: same body, same rule,
   * same failure messages, differing only in whose truck they resolve to.
   *
   * `getMine()` is reused for the lookup, so this inherits the existence and
   * `isActive` checks unchanged — a deactivated driver holding a still-valid
   * 30-day token cannot write here either.
   */
  async updateCoordinates(towTruckId: number, dto: SetCoordinatesDto): Promise<TowTruckApi> {
    await this.getMine(towTruckId)

    // The DTO proved these are real numbers in range; this is the geography
    // half, kept in the service for the reason spelled out in
    // common/coordinates.ts.
    assertWithinArmenia(dto.latitude, dto.longitude)

    await this.towTrucksRepository.setCoordinates(towTruckId, dto.latitude, dto.longitude)

    // Re-read rather than map the update's own return value: `setCoordinates`
    // gives back a bare TowTruck and this endpoint answers with the full
    // profile shape, which needs the images join. It also means the response
    // carries the coordinates Postgres actually stored at DECIMAL(9,6), not
    // the ones that were sent.
    return this.getMine(towTruckId)
  }
}
