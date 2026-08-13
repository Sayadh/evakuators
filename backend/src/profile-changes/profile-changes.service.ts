import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma, ProfileChangeStatus, type ProfileChangeRequest } from '@prisma/client'
import type { SetCoordinatesDto } from '../common/set-coordinates.dto'
import { MyTowTruckService } from '../my-tow-truck/my-tow-truck.service'
import type { UpdateMyTowTruckDto } from '../my-tow-truck/dto/update-my-tow-truck.dto'
import { TelegramService } from '../telegram/telegram.service'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import { diffProfile, isEmptyDiff, type ProfileChanges } from './profile-change-diff'
import { currentProfileSnapshot } from './profile-snapshot'
import {
  ProfileChangesRepository,
  type ProfileChangeWithTruck,
} from './profile-changes.repository'

/**
 * Moderation for edits a driver makes to their own already-published profile.
 *
 * ## Why this exists
 *
 * Approval used to review a listing once, at registration, and never again.
 * After that the dashboard wrote straight to `TowTruck`: a driver could raise
 * their stated capacity, claim coverage they do not serve, or rewrite their
 * description, and it was live before anyone saw it.
 *
 * Now a save queues. `MyTowTruckService.applyUpdate` — the exact code that used
 * to run on save — runs on **approval** instead, so an approved edit is stored
 * identically to how it would have been stored before, with every derivation
 * (`manipulator`, `works24Hours`), every clearable-empty-string rule and every
 * coverage check intact. Nothing about this file re-implements a write.
 *
 * ## What a driver can have queued
 *
 * Exactly one request. Saving again replaces it rather than adding to it: two
 * queued edits to one profile have no defined order, and approving them in the
 * order they arrived would produce a profile neither of them describes. The
 * partial unique index in the migration is what makes that true under a double
 * submit; this service checks first only so the message is a sentence rather
 * than a constraint violation.
 */
@Injectable()
export class ProfileChangesService {
  private readonly logger = new Logger(ProfileChangesService.name)

  constructor(
    private readonly repository: ProfileChangesRepository,
    private readonly towTrucksRepository: TowTrucksRepository,
    private readonly myTowTruck: MyTowTruckService,
    private readonly telegram: TelegramService,
  ) {}

  /**
   * Queues a driver's profile edit.
   *
   * Returns `null` when nothing actually differs. That is a normal outcome, not
   * an error: the dashboard is a full form and submits every field whether or
   * not it was touched, so opening it and pressing save produces an empty diff.
   * Queuing that would put an entry in front of a moderator with nothing in it
   * to approve.
   */
  async submitProfileChange(
    towTruckId: number,
    dto: UpdateMyTowTruckDto,
  ): Promise<ProfileChangeRequest | null> {
    // Existence + isActive, and it throws the driver-facing messages. A
    // deactivated driver holding a still-valid token cannot queue an edit
    // either — the same boundary the direct write had.
    await this.myTowTruck.getMine(towTruckId)

    return this.queue(towTruckId, dto as Record<string, unknown>)
  }

  /**
   * The coordinate dialog's own save, through the same queue.
   *
   * Its own endpoint and its own two-field DTO for the reason
   * `MyTowTruckService.applyCoordinates` documents — this only routes the
   * result into the same review, so that «where I am parked» is moderated like
   * every other public claim rather than being the one field that is not.
   */
  async submitCoordinatesChange(
    towTruckId: number,
    dto: SetCoordinatesDto,
  ): Promise<ProfileChangeRequest | null> {
    await this.myTowTruck.getMine(towTruckId)

    return this.queue(towTruckId, { latitude: dto.latitude, longitude: dto.longitude })
  }

  private async queue(
    towTruckId: number,
    submitted: Record<string, unknown>,
  ): Promise<ProfileChangeRequest | null> {
    const towTruck = await this.towTrucksRepository.findById(towTruckId)
    if (!towTruck) throw new NotFoundException('Ձեր պրոֆիլը չի գտնվել')

    const diff = diffProfile(submitted, currentProfileSnapshot(towTruck))
    if (isEmptyDiff(diff)) return null

    // Re-pointed so the nightly orphan purge leaves them alone while this waits
    // — see TowTruckImage.profileChangeRequestId. Only ids that are not already
    // in the gallery: an existing photo already has an owner.
    const currentImageIds = new Set(towTruck.images.map((image) => image.id))
    const proposedImageIds = Array.isArray(diff.changes.imageIds)
      ? (diff.changes.imageIds as number[]).filter((id) => !currentImageIds.has(id))
      : []

    // Cast at the boundary rather than typing the diff as Prisma's own
    // `InputJsonValue`: that type is a recursive union written for values a
    // caller builds inline, and threading it back through a pure function that
    // knows nothing about Prisma would drag the ORM into the one file in this
    // feature that is plain data.
    return this.repository.replacePending(
      towTruckId,
      diff.changes as Prisma.InputJsonObject,
      diff.before as Prisma.InputJsonObject,
      proposedImageIds,
    )
  }

  /** What the dashboard shows: the queued edit, or the last decision on one */
  async getStatusForDriver(towTruckId: number): Promise<{
    pending: ProfileChangeRequest | null
    lastReviewed: ProfileChangeRequest | null
  }> {
    const pending = await this.repository.findPendingForTruck(towTruckId)
    // A driver who has resubmitted is looking at the new attempt, so the old
    // rejection reason is not shown alongside it — it would read as a verdict
    // on the edit currently waiting.
    const lastReviewed = pending ? null : await this.repository.findLastReviewedForTruck(towTruckId)
    return { pending, lastReviewed }
  }

  /** Withdraws the driver's own queued edit. Nothing was applied, so it is simply gone. */
  async withdraw(towTruckId: number): Promise<{ withdrawn: boolean }> {
    await this.myTowTruck.getMine(towTruckId)
    const count = await this.repository.deletePending(towTruckId)
    return { withdrawn: count > 0 }
  }

  /* ── Moderation ───────────────────────────────────────────────────────── */

  list(
    status: ProfileChangeStatus | undefined,
    limit: number,
    offset: number,
  ): Promise<ProfileChangeWithTruck[]> {
    return this.repository.list(status, limit, offset)
  }

  countPending(): Promise<number> {
    return this.repository.countPending()
  }

  /**
   * Applies a queued edit to the live profile.
   *
   * The write is `MyTowTruckService.applyUpdate` — the same code the driver's
   * save used to run — so an approved edit lands exactly as a direct write would
   * have. Every rule runs again here rather than being trusted from submission
   * time: a photo may have been claimed elsewhere and an admin may have changed
   * the truck's coverage while this sat in the queue, so an approval can fail,
   * and it fails loudly instead of writing half of itself.
   *
   * The request is marked APPROVED **after** the write succeeds. The other order
   * would leave a request marked applied that never was, with no way to tell
   * from the row which happened.
   */
  async approve(id: number): Promise<{ id: number }> {
    const request = await this.requirePending(id)
    const changes = request.changes as ProfileChanges

    const { latitude, longitude, ...profileChanges } = changes

    if (Object.keys(profileChanges).length > 0) {
      await this.myTowTruck.applyUpdate(
        request.towTruckId,
        profileChanges as UpdateMyTowTruckDto,
        // This request's own photos are owned by it while it waits, so the
        // claim check has to admit them — and only them.
        { fromProfileChangeRequestId: request.id },
      )
    }

    // Written through the coordinate path rather than folded into the update
    // above, so the Armenia bounds check and the `locationUpdatedAt` stamp are
    // the same ones a direct save produced.
    if (latitude !== undefined && longitude !== undefined) {
      await this.myTowTruck.applyCoordinates(request.towTruckId, {
        latitude: Number(latitude),
        longitude: Number(longitude),
      })
    }

    await this.repository.markReviewed(id, ProfileChangeStatus.APPROVED)
    this.logger.log(`Profile change #${id} approved for TowTruck #${request.towTruckId}`)

    await this.notify(
      request,
      'Ձեր պրոֆիլի փոփոխությունները հաստատվել են և արդեն երևում են կայքում։',
    )

    return { id }
  }

  /**
   * Refuses a queued edit, with a reason the driver is shown verbatim.
   *
   * The reason is required by the DTO, not optional: an unexplained refusal
   * leaves a driver to guess which of their changes was the problem, and the
   * likeliest next move is to submit the same thing again.
   */
  async reject(id: number, reason: string): Promise<{ id: number }> {
    const request = await this.requirePending(id)

    await this.repository.markReviewed(id, ProfileChangeStatus.REJECTED, reason.trim())
    this.logger.warn(`Profile change #${id} rejected for TowTruck #${request.towTruckId}`)

    // The photos this edit wanted to add are now nobody's: `profileChangeRequestId`
    // still points here, but a REJECTED request no longer protects them — the
    // nightly purge collects them on its own schedule, which is the one place
    // that deletes a Storage object and its row in the right order.
    await this.notify(
      request,
      `Ձեր պրոֆիլի փոփոխությունները չեն հաստատվել։\n\nՊատճառը՝ ${reason.trim()}\n\nԿարող եք ուղղել և կրկին ուղարկել ձեր անձնական էջից։`,
    )

    return { id }
  }

  private async requirePending(id: number): Promise<ProfileChangeWithTruck> {
    const request = await this.repository.findById(id)
    if (!request) throw new NotFoundException(`Փոփոխության հայտ #${id}-ը չի գտնվել`)
    if (request.status !== ProfileChangeStatus.PENDING) {
      throw new BadRequestException(
        `Այս հայտն արդեն մշակված է, կրկին հաստատել/մերժել հնարավոր չէ`,
      )
    }
    return request
  }

  /**
   * Tells the driver what was decided, if we can reach them.
   *
   * Never awaited into the caller's success: a decision that has already been
   * written must not be reported as failed because Telegram was unreachable,
   * and the panel would otherwise offer a retry for something that cannot be
   * repeated. A driver who never linked Telegram simply has no chat id — the
   * dashboard banner is the channel that always works.
   */
  private async notify(request: ProfileChangeWithTruck, message: string): Promise<void> {
    try {
      const truck = await this.towTrucksRepository.findById(request.towTruckId)
      if (!truck?.telegramChatId) return
      await this.telegram.sendMessage(truck.telegramChatId, message)
    } catch (error) {
      this.logger.warn(
        `Profile change #${request.id}: could not notify driver: ${String(error)}`,
      )
    }
  }
}
