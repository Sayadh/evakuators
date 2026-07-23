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

  /** Matches either the main or the secondary phone, exactly as stored */
  findByPhone(phone: string): Promise<TowTruck | null> {
    return this.prisma.towTruck.findFirst({
      where: { OR: [{ phone }, { secondaryPhone: phone }], isActive: true },
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

  /** Consumes the link token and stores the chat id — one-time, then the token is gone */
  linkTelegramChat(id: number, chatId: bigint): Promise<TowTruck> {
    return this.prisma.towTruck.update({
      where: { id },
      data: { telegramChatId: chatId, telegramLinkToken: null, telegramLinkTokenExpiresAt: null },
    })
  }

  updateOwnProfile(id: number, data: Prisma.TowTruckUpdateInput): Promise<TowTruckWithImages> {
    return this.prisma.towTruck.update({
      where: { id },
      data,
      include: { images: true },
    })
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
