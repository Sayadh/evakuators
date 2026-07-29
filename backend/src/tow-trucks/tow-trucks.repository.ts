import { Injectable } from '@nestjs/common'
import type { Prisma, TowTruck } from '@prisma/client'
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
  images: { select: { url: true }, orderBy: { position: 'asc' }, take: 1 },
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
      include: { images: true },
    })
  }

  findById(id: number): Promise<TowTruckWithImages | null> {
    return this.prisma.towTruck.findUnique({
      where: { id },
      include: { images: true },
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
   * Admin-only — unlike the public listing, this intentionally includes
   * inactive trucks, and it is paginated: the admin table is the one listing
   * that grows monotonically and is never filtered down by geography.
   */
  findAllForAdmin(page: { limit: number; offset: number }): Promise<TowTruckWithImages[]> {
    return this.prisma.towTruck.findMany({
      include: { images: true },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    })
  }

  /**
   * Matches ONLY the main `phone` column (never `secondaryPhone`) on active
   * trucks. The main phone is the sole driver-login key (see
   * DriverAuthService) and is enforced unique across active trucks at
   * approval time — `secondaryPhone` is explicitly allowed to repeat, so it
   * must never be used to resolve which profile a login or lookup belongs
   * to. Used both by driver login (request/verify code) and by the
   * duplicate-main-phone check when approving a registration.
   */
  findActiveByMainPhone(phone: string): Promise<TowTruck | null> {
    return this.prisma.towTruck.findFirst({ where: { phone, isActive: true } })
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
      include: { images: true },
    })
  }

  setActive(id: number, isActive: boolean): Promise<TowTruck> {
    return this.prisma.towTruck.update({ where: { id }, data: { isActive } })
  }

  setFeatured(id: number, isFeatured: boolean): Promise<TowTruck> {
    return this.prisma.towTruck.update({ where: { id }, data: { isFeatured } })
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

    if (filters.regionSlug) {
      or.push({ regionSlug: filters.regionSlug })
      for (const citySlug of filters.regionCitySlugs ?? []) {
        or.push({ serviceAreas: { array_contains: [{ slug: citySlug, type: 'city' }] } })
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
