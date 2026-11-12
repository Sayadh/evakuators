/**
 * "I want to be on the website too" — the path from an app-only driver to a
 * published site profile (2026-11-12).
 *
 * A driver who signs up in the app gets a TowTruck that is hidden from the
 * site (`isActive = false`, `appOnly = true`): it carries their profile,
 * photos and password, and live dispatch works without it being public. From
 * the app's profile they file a SiteListingRequest; an admin reviews the
 * profile and either publishes it (`isActive = true`, `appOnly = false`) or
 * rejects it with a reason the driver is shown. Once published, the driver
 * may link Telegram from the app — optional, and it never touches the
 * password they chose (TelegramWebhookController issues one only to a driver
 * who has none of their own).
 */
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SiteListingStatus } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import type { AppConfig } from '../config/configuration'
import { PrismaService } from '../prisma/prisma.service'
import { TelegramService } from '../telegram/telegram.service'
import { toTowTruckApi } from '../tow-trucks/tow-truck.mapper'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'

/** Same lifetime as the admin-generated link (AdminService) */
const TELEGRAM_LINK_TTL_DAYS = 7

/**
 * Where a driver's website profile stands, as the app shows it:
 * - LISTED: public on the site
 * - APP_ONLY: hidden, never asked to be published
 * - REQUESTED: asked, waiting for an admin
 * - REJECTED: asked, refused (reason given) — may ask again
 * - DEACTIVATED: taken off the site by an admin (unpaid, ban…) — not this flow
 */
export type SiteListingState = 'LISTED' | 'APP_ONLY' | 'REQUESTED' | 'REJECTED' | 'DEACTIVATED'

export interface SiteListingView {
  state: SiteListingState
  /** Public page, only when LISTED */
  url: string | null
  requestedAt: string | null
  rejectionReason: string | null
  telegramLinked: boolean
  /** Whether a Telegram link can be made here at all (bot configured) */
  telegramAvailable: boolean
}

export interface AdminSiteListingRequest {
  id: number
  status: SiteListingStatus
  note: string | null
  rejectionReason: string | null
  createdAt: string
  reviewedAt: string | null
  towTruck: {
    id: number
    slug: string
    driverName: string
    phone: string
    vehicleType: string
    isActive: boolean
    images: string[]
    createdAt: string
  }
}

@Injectable()
export class SiteListingService {
  private readonly logger = new Logger(SiteListingService.name)
  private readonly frontendUrl: string

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly towTrucks: TowTrucksRepository,
    config: ConfigService,
  ) {
    this.frontendUrl = config.getOrThrow<AppConfig['frontendUrl']>('frontendUrl')
  }

  async viewFor(towTruckId: number): Promise<SiteListingView> {
    const truck = await this.prisma.towTruck.findUnique({
      where: { id: towTruckId },
      select: { slug: true, isActive: true, appOnly: true, telegramChatId: true },
    })
    if (!truck) throw new NotFoundException('Ձեր պրոֆիլը չի գտնվել')
    const latest = await this.prisma.siteListingRequest.findFirst({ where: { towTruckId }, orderBy: { createdAt: 'desc' } })
    const state: SiteListingState = truck.isActive
      ? 'LISTED'
      : !truck.appOnly
        ? 'DEACTIVATED'
        : latest?.status === SiteListingStatus.PENDING
          ? 'REQUESTED'
          : latest?.status === SiteListingStatus.REJECTED
            ? 'REJECTED'
            : 'APP_ONLY'
    return {
      state,
      url: state === 'LISTED' ? `${this.frontendUrl}/tow-trucks/${truck.slug}` : null,
      requestedAt: state === 'REQUESTED' && latest ? latest.createdAt.toISOString() : null,
      rejectionReason: state === 'REJECTED' ? (latest?.rejectionReason ?? null) : null,
      telegramLinked: truck.telegramChatId !== null,
      telegramAvailable: this.telegram.botUsername.length > 0,
    }
  }

  /** The driver asks to be published. Only an app-only truck may ask, once at a time. */
  async request(towTruckId: number, note: unknown): Promise<SiteListingView> {
    const text = typeof note === 'string' ? note.trim().slice(0, 500) : ''
    const truck = await this.prisma.towTruck.findUnique({ where: { id: towTruckId }, select: { isActive: true, appOnly: true } })
    if (!truck) throw new NotFoundException('Ձեր պրոֆիլը չի գտնվել')
    if (truck.isActive) throw new ConflictException('Ձեր էջն արդեն կայքում է')
    if (!truck.appOnly) throw new ConflictException('Ձեր էջը կայքում ապաակտիվացված է․ դիմեք ադմինիստրատորին')
    try {
      await this.prisma.siteListingRequest.create({ data: { towTruckId, note: text || null } })
    } catch (error) {
      // The partial unique index: one PENDING request per truck
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('Հայտն արդեն ուղարկված է և ստուգվում է')
      throw error
    }
    this.logger.log(`Site listing requested for TowTruck #${towTruckId}`)
    return this.viewFor(towTruckId)
  }

  /**
   * A one-time t.me link the driver taps to connect Telegram — the same token
   * the admin panel mints. Only for a published profile: Telegram is how the
   * WEBSITE talks to its drivers.
   */
  async telegramLink(towTruckId: number): Promise<{ url: string | null; linked: boolean }> {
    const truck = await this.prisma.towTruck.findUnique({ where: { id: towTruckId }, select: { isActive: true, telegramChatId: true } })
    if (!truck) throw new NotFoundException('Ձեր պրոֆիլը չի գտնվել')
    if (truck.telegramChatId !== null) return { url: null, linked: true }
    if (!truck.isActive) throw new ConflictException('Telegram-ը կարելի է կապել կայքում հաստատվելուց հետո')
    if (!this.telegram.botUsername) throw new BadRequestException('Telegram-ի կապումը այս պահին հասանելի չէ')
    const token = randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + TELEGRAM_LINK_TTL_DAYS * 24 * 60 * 60 * 1000)
    await this.prisma.towTruck.update({ where: { id: towTruckId }, data: { telegramLinkToken: token, telegramLinkTokenExpiresAt: expiresAt } })
    this.logger.log(`Driver-requested Telegram link for TowTruck #${towTruckId} (expires ${expiresAt.toISOString()})`)
    return { url: this.telegram.buildLinkUrl(token), linked: false }
  }

  async adminList(status: SiteListingStatus | undefined): Promise<AdminSiteListingRequest[]> {
    const rows = await this.prisma.siteListingRequest.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: status === SiteListingStatus.PENDING ? 'asc' : 'desc' },
      take: 200,
      include: {
        towTruck: {
          select: {
            id: true, slug: true, driverName: true, phone: true, vehicleType: true, isActive: true, createdAt: true,
            images: { select: { url: true }, orderBy: { position: 'asc' } },
          },
        },
      },
    })
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      note: r.note,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      towTruck: {
        id: r.towTruck.id,
        slug: r.towTruck.slug,
        driverName: r.towTruck.driverName,
        phone: r.towTruck.phone,
        vehicleType: r.towTruck.vehicleType,
        isActive: r.towTruck.isActive,
        images: r.towTruck.images.map((i) => i.url),
        createdAt: r.towTruck.createdAt.toISOString(),
      },
    }))
  }

  /** One request with the whole profile the admin is about to publish */
  async adminDetail(id: number) {
    const request = await this.prisma.siteListingRequest.findUnique({ where: { id } })
    if (!request) throw new NotFoundException('Հայտը չի գտնվել')
    const truck = await this.towTrucks.findById(request.towTruckId)
    if (!truck) throw new NotFoundException('Էվակուատորը չի գտնվել')
    return {
      id: request.id,
      status: request.status,
      note: request.note,
      rejectionReason: request.rejectionReason,
      createdAt: request.createdAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      isActive: truck.isActive,
      profile: toTowTruckApi(truck, { includeCoordinates: true, includeOwnerFields: true }),
    }
  }

  /**
   * «Հրապարակել կայքում» for an APP-ONLY driver (the older app sign-up that
   * has no website profile at all): what the driver entered in the app becomes
   * a website registration request — the same review page every site sign-up
   * goes through, where the admin completes what the app never asked (brand,
   * year, areas, services, photos) and approves. Approval moves this same app
   * account onto the new truck (AdminService.approve → linkAppDriver), so the
   * driver keeps their password, sessions and order history.
   * Calling it again returns the request already waiting.
   */
  async registrationFromAppDriver(driverId: number): Promise<{ registrationId: number }> {
    const rows = await this.prisma.$queryRawUnsafe<
      {
        kind: string
        status: string
        phone: string | null
        passwordHash: string | null
        driverName: string | null
        vehicleType: string | null
        capacityTons: number | null
        maxLoadTons: number | null
        manipulator: boolean | null
        wheelSkates: boolean | null
        vehicleDescription: string | null
        baseLatitude: string | null
        baseLongitude: string | null
      }[]
    >(
      `SELECT "kind"::text, "status"::text, "phone", "passwordHash", "driverName", "vehicleType", "capacityTons", "maxLoadTons",
              "manipulator", "wheelSkates", "vehicleDescription", "baseLatitude"::text, "baseLongitude"::text
         FROM "FleetDriver" WHERE "id" = $1`,
      driverId,
    )
    const driver = rows[0]
    if (!driver) throw new NotFoundException('Վարորդը չի գտնվել')
    if (driver.kind !== 'APP_ONLY') throw new ConflictException('Վարորդն արդեն ունի կայքի պրոֆիլ')
    if (driver.status === 'DELETED' || !driver.phone || !driver.passwordHash) throw new ConflictException('Հաշիվը ջնջված է')

    const waiting = await this.prisma.registrationRequest.findFirst({ where: { fleetDriverId: driverId, status: 'PENDING' }, select: { id: true } })
    if (waiting) return { registrationId: waiting.id }

    const onSite = await this.prisma.towTruck.findFirst({ where: { phone: driver.phone }, select: { slug: true } })
    if (onSite) throw new ConflictException(`Այս համարով կայքում արդեն կա էջ («${onSite.slug}»)․ օգտագործեք «Միավորել կայքի առկա էջի հետ»`)

    const [firstName, ...rest] = (driver.driverName ?? '').trim().split(/\s+/)
    const created = await this.prisma.registrationRequest.create({
      data: {
        firstName: firstName || 'Վարորդ',
        lastName: rest.join(' ') || '—',
        phone: driver.phone,
        // The app asked for a free-text description, not brand/model/year:
        // it goes where the admin will see it and split it on the review page
        vehicleBrand: (driver.vehicleDescription ?? '').slice(0, 60),
        vehicleYear: 0,
        vehicleType: driver.vehicleType ?? 'standard',
        capacityRange: capacityRangeFromTons(driver.capacityTons),
        maxLoadTons: driver.maxLoadTons,
        manipulator: driver.manipulator ?? false,
        wheelSkates: driver.wheelSkates ?? false,
        regionSlugs: [],
        citySlugs: [],
        services: [],
        latitude: driver.baseLatitude,
        longitude: driver.baseLongitude,
        source: 'APP',
        passwordHash: driver.passwordHash,
        fleetDriverId: driverId,
      },
      select: { id: true },
    })
    this.logger.log(`Registration request #${created.id} made from app driver #${driverId}`)
    return { registrationId: created.id }
  }

  /**
   * Publishes an app driver's existing, hidden profile straight away — the
   * admin's own decision, no request needed. Only an app-only (hidden) truck:
   * one an admin deactivated is reactivated from the trucks list.
   */
  async adminPublishTruck(towTruckId: number, adminUserId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const truck = await tx.towTruck.findUnique({ where: { id: towTruckId }, select: { isActive: true, appOnly: true } })
      if (!truck) throw new NotFoundException('Էվակուատորը չի գտնվել')
      if (truck.isActive) return
      if (!truck.appOnly) throw new ConflictException('Այս էջն ապաակտիվացված է ադմինիստրատորի կողմից․ ակտիվացրեք այն ադմին վահանակից')
      await tx.towTruck.update({ where: { id: towTruckId }, data: { isActive: true, appOnly: false, deactivationReason: null } })
      await tx.siteListingRequest.updateMany({
        where: { towTruckId, status: SiteListingStatus.PENDING },
        data: { status: SiteListingStatus.APPROVED, reviewedAt: new Date(), reviewedByUserId: adminUserId },
      })
    })
    this.logger.log(`TowTruck #${towTruckId} published on the site by admin #${adminUserId}`)
  }

  async adminPendingCount(): Promise<number> {
    return this.prisma.siteListingRequest.count({ where: { status: SiteListingStatus.PENDING } })
  }

  /** Publishes the profile. The admin reviewed (and, if needed, edited) it on the truck page first. */
  async adminApprove(id: number, adminUserId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const request = await tx.siteListingRequest.findUnique({ where: { id } })
      if (!request) throw new NotFoundException('Հայտը չի գտնվել')
      if (request.status !== SiteListingStatus.PENDING) throw new ConflictException('Հայտն արդեն որոշված է')
      await tx.siteListingRequest.update({
        where: { id },
        data: { status: SiteListingStatus.APPROVED, reviewedAt: new Date(), reviewedByUserId: adminUserId },
      })
      await tx.towTruck.update({
        where: { id: request.towTruckId },
        data: { isActive: true, appOnly: false, deactivationReason: null },
      })
    })
    this.logger.log(`Site listing request #${id} approved by admin #${adminUserId}`)
  }

  async adminReject(id: number, adminUserId: number, reason: unknown): Promise<void> {
    const text = typeof reason === 'string' ? reason.trim() : ''
    if (text.length < 2 || text.length > 500) throw new BadRequestException('Նշեք մերժման պատճառը (2–500 նիշ)')
    const updated = await this.prisma.siteListingRequest.updateMany({
      where: { id, status: SiteListingStatus.PENDING },
      data: { status: SiteListingStatus.REJECTED, rejectionReason: text, reviewedAt: new Date(), reviewedByUserId: adminUserId },
    })
    if (updated.count === 0) throw new ConflictException('Հայտը չի գտնվել կամ արդեն որոշված է')
    this.logger.log(`Site listing request #${id} rejected by admin #${adminUserId}`)
  }
}

/** The website's capacity bands (frontend constants/vehicles.ts CAPACITY_RANGE_OPTIONS): min exclusive, max inclusive */
function capacityRangeFromTons(tons: number | null): string {
  if (typeof tons !== 'number' || !Number.isFinite(tons)) return ''
  if (tons <= 2) return 'up-to-2'
  if (tons <= 3.5) return '2-3.5'
  if (tons <= 5) return '3.5-5'
  if (tons <= 10) return '5-10'
  return 'over-10'
}
