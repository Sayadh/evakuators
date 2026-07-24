import { Injectable } from '@nestjs/common'
import type { Prisma, TowTruck } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { TowTruckFilters, TowTruckWhere, TowTruckWithImages } from './tow-truck.types'

/** All TowTruck database access lives here — services never touch Prisma directly */
@Injectable()
export class TowTrucksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(filters: TowTruckFilters): Promise<TowTruckWithImages[]> {
    return this.prisma.towTruck.findMany({
      where: this.buildWhere(filters),
      include: { images: true },
      orderBy: [{ works24Hours: 'desc' }, { createdAt: 'desc' }],
      ...(filters.limit ? { take: filters.limit } : {}),
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

  /** Admin-only — unlike findMany(), this intentionally includes inactive trucks */
  findAllForAdmin(): Promise<TowTruckWithImages[]> {
    return this.prisma.towTruck.findMany({
      include: { images: true },
      orderBy: { createdAt: 'desc' },
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
