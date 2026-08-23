import { Injectable } from '@nestjs/common'
import type { DriverPrivacyConsent, Prisma, TowTruck } from '@prisma/client'
import { IMAGE_ORDER } from '../images/image-order'
import { PrismaService } from '../prisma/prisma.service'
import { PRIVACY_POLICY_VERSION } from '../privacy-consent/privacy-consent.text'
import type { TowTruckFilters, TowTruckWhere, TowTruckWithImages } from './tow-truck.types'
import {
  HEAVY_DUTY_VEHICLE_TYPE,
  MANIPULATOR_VEHICLE_TYPE,
  SPECIALIST_VEHICLE_TYPES,
} from './vehicle-types'

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

/**
 * The vehicle-type half of "this is general discovery".
 *
 * «Մանիպուլյատոր» and «Ծանր տեխնիկա» are listed on their own landing pages and
 * nowhere else — see SPECIALIST_VEHICLE_TYPES in `vehicle-types.ts` for why,
 * and for why this is the TYPE alone rather than the two union predicates.
 *
 * Written once and spread into every general read path in this file rather
 * than repeated: the failure mode is a new listing method that simply forgets
 * it, which looks like nothing at all until a marz page shows a crane truck.
 * `vehicleType` is a required column (schema.prisma), so `notIn` has no NULL
 * to fall through — the trap described in CLAUDE.md § "Prisma's `in` filter"
 * does not apply here.
 */
const GENERAL_DISCOVERY_VEHICLE_TYPE = {
  notIn: [...SPECIALIST_VEHICLE_TYPES],
} satisfies Prisma.StringFilter

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
      // The counters have to count what the listing lists. A coverage record
      // for a truck the city page will not show is a «3 վարորդ» badge over a
      // page with two — and the badge is what a visitor decides to click on.
      where: { isActive: true, vehicleType: GENERAL_DISCOVERY_VEHICLE_TYPE },
      select: COVERAGE_SELECT,
    })
  }

  /**
   * Card columns for a known set of ids — the second half of the nearest-driver
   * search.
   *
   * The PostGIS query (see `NearestRepository`) answers "who and how far" and
   * returns nothing but ids, precisely so the card itself is still assembled
   * from `CARD_SELECT` here. Two places building a card would be two places to
   * accidentally publish a column the public listing withholds.
   *
   * Deliberately NOT ordered: distance order lives with the distances, in the
   * caller. Postgres has no reason to know about it, and an `ORDER BY` here
   * would be a second, silently-disagreeing opinion about the result order.
   *
   * `isActive` is re-checked even though the caller already filtered on it —
   * this is a public read path and every other one in this file states the rule
   * rather than inheriting it.
   */
  findCardsByIds(ids: number[]): Promise<TowTruckCardRow[]> {
    if (ids.length === 0) return Promise.resolve([])
    return this.prisma.towTruck.findMany({
      where: { id: { in: ids }, isActive: true, vehicleType: GENERAL_DISCOVERY_VEHICLE_TYPE },
      select: CARD_SELECT,
    })
  }

  /**
   * Card columns for the admin-curated homepage picks.
   *
   * An admin ticking `isFeatured` on a specialist truck does not put it on the
   * homepage: the homepage is the most general listing there is. The flag is
   * left alone rather than refused at the write, because it is also what
   * `/admin` reads back — and a truck that stops being `heavy-duty` should
   * simply reappear here, the same way `derivesHeavyEquipment` is applied on
   * read rather than baked in.
   */
  findFeaturedCards(): Promise<TowTruckCardRow[]> {
    return this.prisma.towTruck.findMany({
      where: {
        isActive: true,
        isFeatured: true,
        vehicleType: GENERAL_DISCOVERY_VEHICLE_TYPE,
      },
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
   * Every truck that can be handed a password without a Telegram re-link — it
   * already has a `telegramChatId` from the OTP era, and just never got one.
   *
   * One-time migration query (see `AdminService.issuePasswordsForLinkedDrivers`)
   * for the population passwords replaced: everyone who linked Telegram before
   * this feature existed. Everyone else (`telegramChatId` still null) has no
   * digital channel and can only be reached by re-issuing their link, which
   * mints a password the normal way — see `TelegramWebhookController.handleStart`.
   *
   * Not filtered on `isActive`: a deactivated truck holding no password would
   * simply be unable to log in the moment it is reactivated, for a reason
   * nobody would think to check. Handing it one now costs nothing.
   */
  async findLinkedWithoutPassword(): Promise<
    Array<{ id: number; slug: string; driverName: string; phone: string; telegramChatId: bigint }>
  > {
    const rows = await this.prisma.towTruck.findMany({
      where: { telegramChatId: { not: null }, passwordHash: null },
      select: { id: true, slug: true, driverName: true, phone: true, telegramChatId: true },
    })
    // The WHERE clause already guarantees this at the database level; the
    // filter+assertion here is only to give Prisma's generated type (which
    // cannot express "not null" from a WHERE) an honest non-null field instead
    // of forcing every caller to null-check a value that can never be null.
    return rows
      .filter((row): row is typeof row & { telegramChatId: bigint } => row.telegramChatId !== null)
  }

  /**
   * The pool for the admin broadcast message: active drivers who have Telegram
   * linked, since that is the only channel a broadcast can reach them through.
   *
   * `isActive: true` is deliberate and different from `findLinkedWithoutPassword`
   * above, which intentionally does NOT filter on it (handing a deactivated
   * truck a password costs nothing and saves a surprise on reactivation). A
   * broadcast is different: it is an outbound message to a person, sent right
   * now, about something happening on the platform now — a deactivated driver
   * is not currently working through it, so including them would mean texting
   * someone about a site they are not using. See docs/auth-and-security.md
   * § "The admin broadcast" for the full reasoning, including why this is
   * `isActive` rather than `isActive` OR the more permissive "ever approved".
   */
  async findActiveWithTelegramLinked(): Promise<
    Array<{ id: number; slug: string; driverName: string; phone: string; telegramChatId: bigint }>
  > {
    const rows = await this.prisma.towTruck.findMany({
      where: { isActive: true, telegramChatId: { not: null } },
      select: { id: true, slug: true, driverName: true, phone: true, telegramChatId: true },
    })
    // Same non-null narrowing as findLinkedWithoutPassword — the WHERE clause
    // already guarantees it, this just gives Prisma's generated type an honest
    // non-null field instead of forcing every caller to null-check a value that
    // cannot actually be null.
    return rows
      .filter((row): row is typeof row & { telegramChatId: bigint } => row.telegramChatId !== null)
  }

  /**
   * Admin-only — unlike the public listing, this intentionally includes
   * inactive trucks, and it is paginated: the admin table is the one listing
   * that grows monotonically and is never filtered down by geography.
   */
  /**
   * `vehicleType`, when given, is plain equality on the raw column — not the
   * manipulator/heavy-duty union `buildWhere` applies for the public listing
   * (see `AdminTowTrucksQuery`'s own comment for why the two must differ).
   */
  findAllForAdmin(
    page: { limit: number; offset: number },
    vehicleType?: string,
  ): Promise<(TowTruckWithImages & { privacyConsents: DriverPrivacyConsent[] })[]> {
    return this.prisma.towTruck.findMany({
      where: vehicleType ? { vehicleType } : undefined,
      include: {
        images: { orderBy: IMAGE_ORDER },
        // Filtered rather than "latest overall": this answers exactly the
        // question the dashboard's own block does — is there a LIVE consent
        // at the CURRENT version — so the panel and the driver's own login
        // can never disagree about who still owes one. `take: 1` because a
        // partial unique index makes more than one such row impossible (see
        // the DriverPrivacyConsent migration). See AdminTowTruckSummary.privacyConsent.
        privacyConsents: {
          where: { revokedAt: null, policyVersion: PRIVACY_POLICY_VERSION },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    })
  }

  /**
   * Every published driver, unpaginated, for the admin CSV export — active
   * and deactivated alike, same "admin sees everyone" rule as
   * `findAllForAdmin`. A `select`, not the default full row: the export reads
   * four columns, and pulling `description`, coverage JSON, coordinates and
   * every other column for every driver just to throw them away would be the
   * wide read `findByCard`'s own comment warns against, at the scale of the
   * WHOLE table instead of one page of it.
   */
  findAllForExport(): Promise<
    { id: number; driverName: string; companyName: string | null; phone: string; isActive: boolean }[]
  > {
    return this.prisma.towTruck.findMany({
      select: { id: true, driverName: true, companyName: true, phone: true, isActive: true },
      orderBy: { createdAt: 'asc' },
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

  /** Admin-set "can move heavy machinery" — see AdminService.setTowTruckHeavyEquipment */
  setHeavyEquipment(id: number, heavyEquipment: boolean): Promise<TowTruck> {
    return this.prisma.towTruck.update({ where: { id }, data: { heavyEquipment } })
  }

  /**
   * Writes the base parking coordinates, for both the driver's own edit and the
   * admin correction — one method, so the timestamp cannot be set by one caller
   * and forgotten by the other.
   *
   * `locationUpdatedAt` is stamped here rather than passed in for exactly that
   * reason: it describes this write, so the write is what should decide it.
   * Prisma accepts a plain `number` for a `Decimal` column and rounds it to the
   * declared scale (6 places), which is why callers read the row back instead
   * of echoing what they sent.
   */
  setCoordinates(id: number, latitude: number, longitude: number): Promise<TowTruck> {
    return this.prisma.towTruck.update({
      where: { id },
      data: { latitude, longitude, locationUpdatedAt: new Date() },
    })
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
   * Writes the truck's base: the three placement columns plus the label the
   * cards render for it.
   *
   * `locationName` travels with them rather than in its own method because it
   * is the display half of the same fact — the columns say which page the truck
   * ranks on, the label says what a customer reads there. Splitting them is how
   * a driver ends up filed under Vardenis while their card still says Abovyan.
   */
  setPrimaryArea(
    id: number,
    data: {
      citySlug: string | null
      districtSlug: string | null
      regionSlug: string | null
      locationName: string
    },
  ): Promise<TowTruck> {
    return this.prisma.towTruck.update({ where: { id }, data })
  }

  /**
   * Writes the served-areas list together with the structural placement it
   * implies — one method taking both, because they are one fact.
   *
   * `serviceAreas` (what the profile lists) and `citySlug`/`districtSlug`/
   * `regionSlug` (what the browsing pages filter on) have to describe the same
   * geography; a method that could set one without the other is how a truck
   * ends up filed under a city it no longer serves. `MyTowTruckService` enforces
   * that pairing by hand for the driver's own save — this signature makes it
   * unforgettable for the admin removal path instead.
   *
   * All three placement columns are `null`able rather than optional on purpose:
   * a truck moving out of Yerevan has to be able to clear `districtSlug`, and a
   * truck left covering only road corridors has no placement at all. `undefined`
   * would mean "leave it alone", which is never what this caller wants.
   */
  setServiceAreas(
    id: number,
    serviceAreas: Prisma.InputJsonValue,
    placement: { citySlug: string | null; districtSlug: string | null; regionSlug: string | null },
  ): Promise<TowTruck> {
    return this.prisma.towTruck.update({
      where: { id },
      data: { serviceAreas, ...placement },
    })
  }

  /**
   * Both password columns are written here and in `revokePasswordWithLinkToken`
   * below, and nowhere else — which is the point: they describe a single fact
   * together ("whose password is this"), and a method that could set the hash
   * without saying whether it is ours would make `mustChangePassword` a value
   * someone has to remember to update.
   *
   * Takes a hash, never a password — bcrypt lives in DriverAuthService, so
   * there is no call site from which a plaintext could reach the column.
   */
  setPassword(id: number, passwordHash: string, mustChangePassword: boolean): Promise<TowTruck> {
    return this.prisma.towTruck.update({
      where: { id },
      data: { passwordHash, mustChangePassword },
    })
  }

  /**
   * The admin password reset: takes the driver's password away and arms a fresh
   * Telegram link in its place, so tapping the link mints them a new temporary
   * one (`TelegramWebhookController.handleStart`).
   *
   * ## Why one write and not two calls
   *
   * `setPassword` and `setTelegramLinkToken` already exist, and doing this as
   * two sequential updates would be shorter. It is one statement because
   * **neither order is safe**:
   *
   * - clear first, then arm the token → if the second write fails, the driver
   *   is locked out with no way back in, and nothing on the row records that a
   *   link was meant to follow;
   * - arm first, then clear → the driver can tap the link in the gap. That
   *   consumes the token and mints nothing (they still own their password at
   *   that instant), and the clear then lands on a row with no live link at
   *   all — same stranding, but silent, because the admin saw a success.
   *
   * A single `update` has no gap, so neither case exists. Do not split it.
   *
   * ## What it deliberately does NOT touch
   *
   * `telegramChatId`. The driver stays linked, so contact notices keep working
   * while they are between passwords, and if they tap the new link with the
   * same account nothing about the link changes hands. Tapping it with a
   * *different* account still re-points the chat, exactly as it always did —
   * `linkTelegramChat` owns that, not this.
   *
   * `mustChangePassword: false` is the honest value for a row with no hash, not
   * a reset of intent: the flag means "the password on this row is one we
   * generated", and there is no password on this row. It is also what a
   * freshly-approved truck carries, and `issueTemporaryPassword` reads the two
   * columns together for exactly that reason.
   */
  revokePasswordWithLinkToken(id: number, token: string, expiresAt: Date): Promise<TowTruck> {
    return this.prisma.towTruck.update({
      where: { id },
      data: {
        passwordHash: null,
        mustChangePassword: false,
        telegramLinkToken: token,
        telegramLinkTokenExpiresAt: expiresAt,
      },
    })
  }

  /**
   * Hard delete. `TowTruckImage` and `Review` cascade at the DB level (see
   * schema.prisma onDelete: Cascade) — this only removes the
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

    // The two specialist pages are the only listings that honour a marz-wide
    // service area or an «Ամբողջ Հայաստան» answer.
    //
    // Both are offered exclusively to crane trucks and machinery transporters
    // (`hasUncappedCoverage`), whose whole premise is that they travel to a
    // booked job — but the flag itself lives on the row, and a `flatbed` that
    // ticked «Ունի մանիպուլյատոր» is exempt too. If these terms joined the
    // geography `OR` unconditionally, that flatbed would appear on the listing
    // of every town in the country: the exact "claims everywhere, comes
    // nowhere" outcome the coverage cap exists to prevent, reintroduced through
    // the exemption from it.
    //
    // So the widening is scoped to the pages the exemption was granted for.
    // Same discipline as the vehicle-type branches below — a specialist
    // condition NARROWS or applies within a specialist request; it never leaks
    // into general discovery.
    const specialistListing =
      filters.vehicleType === MANIPULATOR_VEHICLE_TYPE ||
      filters.vehicleType === HEAVY_DUTY_VEHICLE_TYPE

    if (filters.regionSlug) {
      or.push({ regionSlug: filters.regionSlug })
      for (const citySlug of filters.regionCitySlugs ?? []) {
        or.push({ serviceAreas: { array_contains: [{ slug: citySlug, type: 'city' }] } })
      }
      if (specialistListing) {
        or.push({
          serviceAreas: { array_contains: [{ slug: filters.regionSlug, type: 'region' }] },
        })
        or.push({ servesAllArmenia: true })
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

    // Vehicle type NARROWS whatever the geography clause matched — it must never
    // join `or`. Pushing it in there would turn "trucks in Kotayk that are
    // manipulators" into "trucks in Kotayk OR manipulators anywhere", i.e. the
    // whole country, which is the sort of bug that looks like the page merely
    // returning too much.
    //
    // Hence `AND` rather than a second `OR` key: an object cannot carry two, and
    // Prisma ANDs top-level fields with `OR` exactly as needed here.
    if (filters.vehicleType === MANIPULATOR_VEHICLE_TYPE) {
      // Not a plain equality. «Մանիպուլյատոր» is answered two ways — the vehicle
      // type and the equipment checkbox — and either counts (see
      // vehicle-types.ts). Writes derive the column now, so new rows agree; rows
      // written before that do not, and nothing migrated them.
      where.AND = [
        { OR: [{ vehicleType: MANIPULATOR_VEHICLE_TYPE }, { manipulator: true }] },
      ]
    } else if (filters.vehicleType === HEAVY_DUTY_VEHICLE_TYPE) {
      // Same union, different question, and note the nesting is identical: this
      // OR lives INSIDE `AND`, never next to the geography `or` above. «Ծանր
      // տեխնիկա» is answered by the vehicle type or by the admin-set flag —
      // a flatbed with a long platform and a manipulator with a big crane both
      // belong on that page, and neither picked `heavy-duty` as their type.
      //
      // Both halves are load-bearing here, more so than in the manipulator
      // branch: the column deliberately stores ONLY what an admin decided and
      // is never backfilled from the type (see the migration), so without the
      // first term every `heavy-duty` truck would vanish from its own page.
      // Without the second, no admin decision would have any effect at all.
      where.AND = [
        { OR: [{ vehicleType: HEAVY_DUTY_VEHICLE_TYPE }, { heavyEquipment: true }] },
      ]
    } else if (filters.vehicleType) {
      where.vehicleType = filters.vehicleType
    } else {
      // Nobody named a type, so this is general discovery — a city, a marz,
      // Yerevan, a corridor, or the sitemap walking the lot. The two
      // specialist types are landing-page-only and drop out here.
      //
      // Deliberately the LAST branch and not a line at the top: naming a type
      // is what lifts the exclusion, and the three branches above are exactly
      // the ways to name one. Hoisting it would either delete both landing
      // pages or need an exception carved back out for them — a rule and its
      // own exception in the same function, which is how the manipulator
      // union got its first bug.
      where.vehicleType = GENERAL_DISCOVERY_VEHICLE_TYPE
    }

    return where
  }
}
