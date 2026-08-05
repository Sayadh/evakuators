import { Injectable } from '@nestjs/common'
import type { Prisma, TowTruck } from '@prisma/client'
import { IMAGE_ORDER } from '../images/image-order'
import { PrismaService } from '../prisma/prisma.service'
import type { TowTruckFilters, TowTruckWhere, TowTruckWithImages } from './tow-truck.types'

/**
 * Exactly the columns a listing card renders — see TowTruckCardApi for why the
 * list and detail shapes differ.
 *
 * This is a `select`, not a post-mapping step, so the narrowing happens in
 * Postgres: `description` (unbounded text) and the driver's other contact
 * columns are never read off disk, and `images` is capped at the one thumbnail
 * the card shows instead of loading every photo row for every truck in the list.
 */
const CARD_SELECT = {
  id: true,
  slug: true,
  driverName: true,
  companyName: true,
  phone: true,
  whatsapp: true,
  works24Hours: true,
  workingHoursText: true,
  priceCityCallout: true,
  vehicleBrand: true,
  vehicleModel: true,
  vehicleType: true,
  capacityTons: true,
  manipulator: true,
  services: true,
  serviceAreas: true,
  regionSlug: true,
  citySlug: true,
  districtSlug: true,
  locationName: true,
  updatedAt: true,
  // IMAGE_ORDER, not just `position` — every legacy row shares position 0, so
  // without the id tiebreak "the thumbnail" is whatever Postgres returns first
  // and can differ between two requests for the same truck.
  images: { select: { url: true }, orderBy: IMAGE_ORDER, take: 1 },
} satisfies Prisma.TowTruckSelect

/** Five columns — everything needed to count coverage, nothing else */
const COVERAGE_SELECT = {
  regionSlug: true,
  citySlug: true,
  districtSlug: true,
  serviceAreas: true,
  works24Hours: true,
} satisfies Prisma.TowTruckSelect

export type TowTruckCardRow = Prisma.TowTruckGetPayload<{ select: typeof CARD_SELECT }>
export type TowTruckCoverageRow = Prisma.TowTruckGetPayload<{ select: typeof COVERAGE_SELECT }>

/** All TowTruck database access lives here — services never touch Prisma directly */
@Injectable()
export class TowTrucksRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Public listing — card columns only, always bounded by the caller's limit */
  findManyCards(filters: TowTruckFilters & { limit: number }): Promise<TowTruckCardRow[]> {
    return this.prisma.towTruck.findMany({
      where: this.buildWhere(filters),
      select: CARD_SELECT,
      // Deterministic tie-break: without `id` a stable order is not guaranteed
      // across pages, so an offset walk could repeat or skip rows.
      orderBy: [{ works24Hours: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: filters.limit,
      skip: filters.offset ?? 0,
    })
  }

  /**
   * Every active truck's geography footprint, for the per-region/city/district
   * counters. Unbounded on purpose — it is one small row per truck and the
   * frontend needs all of them to count correctly — but it carries no contact
   * details, no description and no images, so "all of them" stays cheap.
   */
  findCoverage(): Promise<TowTruckCoverageRow[]> {
    return this.prisma.towTruck.findMany({
      where: { isActive: true },
      select: COVERAGE_SELECT,
    })
  }

  /** Card columns for the admin-curated homepage picks */
  findFeaturedCards(): Promise<TowTruckCardRow[]> {
    return this.prisma.towTruck.findMany({
      where: { isActive: true, isFeatured: true },
      select: CARD_SELECT,
      orderBy: { createdAt: 'desc' },
    })
  }

  findBySlug(slug: string): Promise<TowTruckWithImages | null> {
    return this.prisma.towTruck.findFirst({
      where: { slug, isActive: true },
      include: { images: { orderBy: IMAGE_ORDER } },
    })
  }

  /**
   * Unlike findBySlug() above, this deliberately ignores isActive — slug is
   * @unique at the DB level regardless of active/deactivated status, so a
   * collision with a DEACTIVATED truck would still throw an uncaught Prisma
   * P2002 at create() time if this check only looked at active rows (and
   * reactivating that truck later would then hit the same wall in reverse).
   * Used only by AdminService.approve() to pre-check before creating a new
   * TowTruck, with a friendly message instead of a raw constraint error.
   */
  findBySlugAnyStatus(slug: string): Promise<TowTruck | null> {
    return this.prisma.towTruck.findUnique({ where: { slug } })
  }

  findById(id: number): Promise<TowTruckWithImages | null> {
    return this.prisma.towTruck.findUnique({
      where: { id },
      include: { images: { orderBy: IMAGE_ORDER } },
    })
  }

  /**
   * Lean existence + visibility probe: two columns, straight off the primary
   * key, no images join. Used on the analytics write path (which runs on every
   * page view and every contact-button press), so pulling the full row plus its
   * images the way findById() does would be a wide read on the hottest query in
   * the system for the sake of one boolean.
   *
   * Returns null for an id that doesn't exist, so callers can distinguish
   * "no such truck" (404) from "exists but deactivated" (403 / ignore).
   */
  findStatusById(id: number): Promise<{ id: number; isActive: boolean } | null> {
    return this.prisma.towTruck.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    })
  }

  /**
   * The two columns DriverNotificationService needs, and nothing else.
   *
   * This sits on the analytics write path, which runs on every contact-button
   * press in the system — pulling the full row plus its images the way
   * findById() does would be a wide read for a chat id and a timestamp.
   * Same reasoning as findStatusById() above.
   */
  findNotificationTargetById(id: number): Promise<{
    telegramChatId: bigint | null
    contactNoticeIntroAt: Date | null
  } | null> {
    return this.prisma.towTruck.findUnique({
      where: { id },
      select: { telegramChatId: true, contactNoticeIntroAt: true },
    })
  }

  /**
   * Claims the right to send the one-time explanation, atomically.
   *
   * The `contactNoticeIntroAt: null` condition is the whole point: two contact
   * clicks landing in the same instant would both read "not sent yet" and both
   * append the explanation. Letting the UPDATE's own WHERE decide means
   * Postgres arbitrates — exactly one caller sees `count === 1`. Same principle
   * as the analytics dedup constraint (see AnalyticsRepository.recordEvent):
   * the database is the arbiter, never a read-then-write in application code.
   *
   * @returns true when THIS caller won the claim and must include the intro.
   */
  async claimContactNoticeIntro(id: number): Promise<boolean> {
    const result = await this.prisma.towTruck.updateMany({
      where: { id, contactNoticeIntroAt: null },
      data: { contactNoticeIntroAt: new Date() },
    })
    return result.count === 1
  }

  /** Releases a claim whose message never actually got delivered */
  async releaseContactNoticeIntro(id: number): Promise<void> {
    await this.prisma.towTruck.update({
      where: { id },
      data: { contactNoticeIntroAt: null },
    })
  }

  /**
   * Admin-only — unlike the public listing, this intentionally includes
   * inactive trucks, and it is paginated: the admin table is the one listing
   * that grows monotonically and is never filtered down by geography.
   */
  findAllForAdmin(page: { limit: number; offset: number }): Promise<TowTruckWithImages[]> {
    return this.prisma.towTruck.findMany({
      include: { images: { orderBy: IMAGE_ORDER } },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    })
  }

  /**
   * How many trucks exist in total, and how many of those are active.
   *
   * Deliberately separate from `findAllForAdmin` rather than a `total` added
   * to its result: the list is paginated and refetched on every "show more",
   * while this is one number that only changes when a truck is created,
   * deleted or (de)activated. Keeping them apart also leaves the existing
   * `GET /admin/tow-trucks` response an unchanged array.
   *
   * `inactive` is derived rather than counted — a third query could only ever
   * disagree with the two above.
   */
  async countForAdmin(): Promise<{ total: number; active: number; inactive: number }> {
    const [total, active] = await Promise.all([
      this.prisma.towTruck.count(),
      this.prisma.towTruck.count({ where: { isActive: true } }),
    ])
    return { total, active, inactive: total - active }
  }

  /**
   * Matches ONLY the main `phone` column (never `secondaryPhone`) on active
   * trucks. The main phone is the sole driver-login key (see
   * DriverAuthService) — a deactivated truck must never resolve here, login
   * has to behave exactly as if that phone belonged to no one. This is a
   * login LOOKUP, not a uniqueness check — see findByMainPhoneAnyStatus()
   * below for the latter (used by AdminService for approve/reactivate/edit).
   */
  findActiveByMainPhone(phone: string): Promise<TowTruck | null> {
    return this.prisma.towTruck.findFirst({ where: { phone, isActive: true } })
  }

  /**
   * Uniqueness check for the main phone — matches ANY truck regardless of
   * active/deactivated status, same reasoning as findBySlugAnyStatus() for
   * slug. Without this, a phone freed up by deactivating truck A could be
   * handed to a brand-new truck B while A is inactive (harmless on its own,
   * since findActiveByMainPhone only ever resolves one row), but
   * reactivating A afterward would then silently create two ACTIVE trucks
   * sharing one login phone — `findFirst` would arbitrarily resolve to only
   * one of them, and the other driver's login would break with no warning.
   * `excludeId` lets a caller ask "does anyone ELSE have this phone" against
   * a row that already exists (edit-phone, reactivate) — approve() has no
   * id yet, so it's omitted there.
   */
  findByMainPhoneAnyStatus(phone: string, excludeId?: number): Promise<TowTruck | null> {
    return this.prisma.towTruck.findFirst({
      where: { phone, ...(excludeId !== undefined ? { id: { not: excludeId } } : {}) },
    })
  }

  findByTelegramLinkToken(token: string): Promise<TowTruck | null> {
    return this.prisma.towTruck.findFirst({
      where: { telegramLinkToken: token, telegramLinkTokenExpiresAt: { gt: new Date() } },
    })
  }

  findByTelegramChatId(chatId: bigint): Promise<TowTruck | null> {
    return this.prisma.towTruck.findUnique({ where: { telegramChatId: chatId } })
  }

  setTelegramLinkToken(id: number, token: string, expiresAt: Date): Promise<TowTruck> {
    return this.prisma.towTruck.update({
      where: { id },
      data: { telegramLinkToken: token, telegramLinkTokenExpiresAt: expiresAt },
    })
  }

  /**
   * Consumes the link token and stores the chat id — one-time, then the
   * token is gone. telegramChatId is @unique, so if this Telegram account is
   * still attached to a *different* TowTruck (a stale/test profile, or the
   * driver relinking after being re-approved under a new profile), free it
   * there first. Without this, the plain update() throws a unique-constraint
   * PrismaClientKnownRequestError, which bubbles up as an uncaught 500 from
   * the webhook endpoint — Telegram sees the failed response and marks the
   * update as undelivered, and because we never got past the DB write, the
   * driver never receives ANY reply, not even an error message. That 500 is
   * exactly what showed up in `getWebhookInfo`'s `last_error_message` and in
   * the PM2 logs when this was first reported.
   */
  linkTelegramChat(id: number, chatId: bigint): Promise<TowTruck> {
    return this.prisma.$transaction(async (tx) => {
      await tx.towTruck.updateMany({
        where: { telegramChatId: chatId, id: { not: id } },
        data: { telegramChatId: null },
      })
      return tx.towTruck.update({
        where: { id },
        data: { telegramChatId: chatId, telegramLinkToken: null, telegramLinkTokenExpiresAt: null },
      })
    })
  }

  updateOwnProfile(id: number, data: Prisma.TowTruckUpdateInput): Promise<TowTruckWithImages> {
    return this.prisma.towTruck.update({
      where: { id },
      data,
      include: { images: { orderBy: IMAGE_ORDER } },
    })
  }

  setActive(id: number, isActive: boolean): Promise<TowTruck> {
    return this.prisma.towTruck.update({ where: { id }, data: { isActive } })
  }

  setFeatured(id: number, isFeatured: boolean): Promise<TowTruck> {
    return this.prisma.towTruck.update({ where: { id }, data: { isFeatured } })
  }

  /**
   * Admin-only correction of the main login phone (e.g. driver mistyped it at
   * registration). Uniqueness against other active trucks is enforced by the
   * caller (AdminService.setTowTruckPhone) before this runs — same rule as
   * approve(), since DriverAuthService looks a truck up by this exact field.
   */
  setPhone(id: number, phone: string): Promise<TowTruck> {
    return this.prisma.towTruck.update({ where: { id }, data: { phone } })
  }

  /**
   * Hard delete. `TowTruckImage`, `Review` and `DriverOtp` all cascade at the
   * DB level (see schema.prisma onDelete: Cascade) — this only removes the
   * TowTruck row and everything FK-linked to it. Supabase Storage objects are
   * NOT covered by that cascade (they live outside Postgres) — the caller
   * (AdminService) is responsible for removing those first.
   */
  delete(id: number): Promise<TowTruck> {
    return this.prisma.towTruck.delete({ where: { id } })
  }

  private buildWhere(filters: TowTruckFilters): TowTruckWhere {
    const where: TowTruckWhere = { isActive: true }
    const or: TowTruckWhere[] = []

    if (filters.citySlug) {
      or.push(
        { citySlug: filters.citySlug },
        { serviceAreas: { array_contains: [{ slug: filters.citySlug, type: 'city' }] } },
      )
    }

    if (filters.districtSlug) {
      or.push(
        { districtSlug: filters.districtSlug },
        { serviceAreas: { array_contains: [{ slug: filters.districtSlug, type: 'district' }] } },
      )
    }

    // A road corridor matches its own slug and nothing else. No `citySlug`
    // fallback the way cities and districts have one: a zone is not a place a
    // truck can be based in, and nothing along it is implied. Picking
    // «Գառնի–Գեղարդ» returns the drivers who picked «Գառնի–Գեղարդ».
    if (filters.zoneSlug) {
      or.push({ serviceAreas: { array_contains: [{ slug: filters.zoneSlug, type: 'route' }] } })
    }

    if (filters.regionSlug) {
      or.push({ regionSlug: filters.regionSlug })
      for (const citySlug of filters.regionCitySlugs ?? []) {
        or.push({ serviceAreas: { array_contains: [{ slug: citySlug, type: 'city' }] } })
      }
      // Covering a corridor in a marz counts as serving that marz, exactly as
      // covering one of its cities does. Without this a driver whose only
      // coverage is «Գառնի–Գեղարդ» would be absent from Kotayk's own page —
      // findable solely by someone who already knew to pick that corridor.
      for (const zoneSlug of filters.regionZoneSlugs ?? []) {
        or.push({ serviceAreas: { array_contains: [{ slug: zoneSlug, type: 'route' }] } })
      }
    }

    if (filters.yerevan) {
      or.push(
        { districtSlug: { not: null } },
        { serviceAreas: { array_contains: [{ type: 'district' }] } },
      )
    }

    if (or.length > 0) where.OR = or
    return where
  }
}
