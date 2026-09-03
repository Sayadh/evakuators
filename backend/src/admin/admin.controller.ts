import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ProfileChangeStatus, RegistrationStatus } from '@prisma/client'
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard'
import { SetCoordinatesDto } from '../common/set-coordinates.dto'
import type { AdminRegistrationSummary } from './admin-registration.mapper'
import type { AdminPaymentSummary } from './admin-payment.mapper'
import { toProfileChangeApi } from '../profile-changes/profile-change.mapper'
import type { ProfileChangeApi } from '../profile-changes/profile-change.types'
import { ProfileChangesService } from '../profile-changes/profile-changes.service'
import type { ReviewWithTruck } from '../reviews/reviews.repository'
import type { ServiceAreaJson } from '../tow-trucks/tow-truck.types'
import type { AdminTowTruckSummary } from './admin-tow-truck.mapper'
import { AdminService } from './admin.service'
import { AdminListQuery, AdminPaymentsQuery, AdminRegistrationsQuery, AdminTowTrucksQuery } from './dto/admin-list.query'
import { ApproveRegistrationDto } from './dto/approve-registration.dto'
import { BroadcastMessageDto } from './dto/broadcast-message.dto'
import { IssuePasswordsDto } from './dto/issue-passwords.dto'
import { RejectProfileChangeDto } from './dto/reject-profile-change.dto'
import { RemoveServiceAreaDto } from './dto/remove-service-area.dto'
import { SetPrimaryAreaDto } from './dto/set-primary-area.dto'
import { SetTowTruckActiveDto } from './dto/set-tow-truck-active.dto'
import { SetTowTruckFeaturedDto } from './dto/set-tow-truck-featured.dto'
import { SetTowTruckHeavyEquipmentDto } from './dto/set-tow-truck-heavy-equipment.dto'
import { SetTowTruckPhoneDto } from './dto/set-tow-truck-phone.dto'

/** Moderation endpoints — every route requires a valid admin JWT (see AdminAuthModule) */
@UseGuards(AdminJwtGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly profileChanges: ProfileChangesService,
  ) {}

  /* ── Driver profile edits awaiting review ─────────────────────────────── */

  /**
   * The moderation queue for edits drivers made to their own live profiles.
   *
   * A separate queue from `registration-requests`, deliberately: one decides
   * whether a driver joins the platform, the other whether a change to an
   * already-published listing goes live. They have different bodies, different
   * consequences and different urgency, and merging them would mean a moderator
   * reading two kinds of thing in one list with no way to filter.
   */
  @Get('profile-changes')
  async listProfileChanges(@Query() query: AdminListQuery): Promise<ProfileChangeApi[]> {
    const requests = await this.profileChanges.list(
      ProfileChangeStatus.PENDING,
      query.limit,
      query.offset,
    )
    return requests.map(toProfileChangeApi)
  }

  /** How many are waiting — shown next to the section heading */
  @Get('profile-changes/count')
  async countProfileChanges(): Promise<{ pending: number }> {
    return { pending: await this.profileChanges.countPending() }
  }

  /**
   * Applies the queued edit to the live profile.
   *
   * Runs the driver's own write path (`MyTowTruckService.applyUpdate`), so an
   * approved edit is stored exactly as a direct save would have stored it. It
   * can legitimately fail — a photo may have been claimed elsewhere, an admin
   * may have changed the truck's coverage while this waited — and the error
   * surfaces rather than being swallowed.
   */
  @Post('profile-changes/:id/approve')
  approveProfileChange(@Param('id', ParseIntPipe) id: number): Promise<{ id: number }> {
    return this.profileChanges.approve(id)
  }

  /** Refuses it, with a reason the driver is shown verbatim — see RejectProfileChangeDto */
  @Post('profile-changes/:id/reject')
  rejectProfileChange(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectProfileChangeDto,
  ): Promise<{ id: number }> {
    return this.profileChanges.reject(id, dto.reason)
  }

  @Get('registration-requests')
  list(@Query() query: AdminRegistrationsQuery): Promise<AdminRegistrationSummary[]> {
    return this.adminService.listRegistrations(query)
  }

  /**
   * One request by id — what the review page loads.
   *
   * Declared AFTER the collection route above but before the `:id/approve`
   * POST, which is only a readability choice: Nest matches on method and full
   * path, so `GET registration-requests` and `GET registration-requests/:id`
   * cannot shadow each other the way two same-method patterns could.
   */
  @Get('registration-requests/:id')
  getRegistration(@Param('id', ParseIntPipe) id: number): Promise<AdminRegistrationSummary> {
    return this.adminService.getRegistration(id)
  }

  @Post('registration-requests/:id/approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveRegistrationDto,
  ): Promise<{ towTruckId: number; telegramLinkUrl: string }> {
    return this.adminService.approve(id, dto)
  }

  /** (Re)generate the Telegram-login link for an existing tow truck (e.g. if the first one expired) */
  @Post('tow-trucks/:id/telegram-link')
  regenerateTelegramLink(@Param('id', ParseIntPipe) id: number): Promise<{ telegramLinkUrl: string }> {
    return this.adminService
      .generateTelegramLink(id)
      .then((telegramLinkUrl) => ({ telegramLinkUrl }))
  }

  /**
   * The drivers who could be handed a password right now — linked Telegram, no
   * password yet. Read-only; the panel shows this list with checkboxes so an
   * admin picks recipients before anything is sent.
   *
   * Declared before any `tow-trucks/:id` route for the same reason
   * `tow-trucks/count` is (see its comment and
   * admin.controller.count-route.spec.ts).
   */
  @Get('tow-trucks/password-candidates')
  passwordCandidates(): Promise<
    Array<{ id: number; slug: string; driverName: string; phone: string }>
  > {
    return this.adminService.listPasswordCandidates()
  }

  /**
   * Sends a temporary password to the drivers named in the body, and only
   * them. Takes an explicit id list rather than acting on everyone, because a
   * Telegram message cannot be unsent and staging's database holds real
   * drivers' real chat ids — see AdminService.issuePasswordsForLinkedDrivers.
   *
   * Ids that are no longer eligible are counted as `skipped`, never acted on,
   * so this is safe to repeat and safe against a stale list.
   */
  @Post('tow-trucks/issue-passwords')
  issuePasswords(@Body() dto: IssuePasswordsDto): Promise<{
    issued: number
    failed: Array<{ id: number; slug: string }>
    skipped: number
  }> {
    return this.adminService.issuePasswordsForLinkedDrivers(dto.towTruckIds)
  }

  /**
   * Takes a driver's password away and returns a fresh link to send them, which
   * is where the replacement comes from. The only way a driver who forgot (or
   * leaked) their password gets back in — there is no self-service reset, by
   * design. See AdminService.resetDriverPassword.
   *
   * POST rather than DELETE: the effect is not "remove a resource", it is
   * "issue a new credential channel", and the response carries the link that
   * makes the action useful.
   *
   * Three segments, so no shadowing risk against the two-segment
   * `tow-trucks/password-candidates` and `tow-trucks/count` above — asserted
   * for the whole route table by admin.controller.count-route.spec.ts.
   */
  @Post('tow-trucks/:id/reset-password')
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ telegramLinkUrl: string; hadPassword: boolean }> {
    return this.adminService.resetDriverPassword(id)
  }

  /**
   * The pool for the broadcast picker: active drivers with Telegram linked —
   * the only ones a broadcast can reach. Read-only, same shape and same reason
   * as `password-candidates` above. Declared before any `tow-trucks/:id` route
   * for the same reason that one is.
   */
  @Get('tow-trucks/broadcast-candidates')
  broadcastCandidates(): Promise<
    Array<{ id: number; slug: string; driverName: string; phone: string }>
  > {
    return this.adminService.listBroadcastCandidates()
  }

  /**
   * Sends one admin-authored message, verbatim, to exactly the drivers named
   * in the body — never "everyone", for the same reason `issue-passwords`
   * takes an explicit list: a Telegram message cannot be unsent, and
   * staging's database holds real drivers' real chat ids.
   */
  @Post('tow-trucks/broadcast-message')
  broadcastMessage(@Body() dto: BroadcastMessageDto): Promise<{
    sent: number
    failed: Array<{ id: number; slug: string }>
    skipped: number
  }> {
    return this.adminService.broadcastMessage(dto.message, dto.towTruckIds)
  }

  @Post('registration-requests/:id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ id: number; status: RegistrationStatus }> {
    return this.adminService.reject(id)
  }

  @Get('reviews')
  listReviews(@Query() query: AdminListQuery): Promise<ReviewWithTruck[]> {
    return this.adminService.listPendingReviews(query)
  }

  @Post('reviews/:id/approve')
  approveReview(@Param('id', ParseIntPipe) id: number): Promise<{ id: number; isApproved: boolean }> {
    return this.adminService.approveReview(id)
  }

  @Post('reviews/:id/reject')
  rejectReview(@Param('id', ParseIntPipe) id: number): Promise<{ id: number }> {
    return this.adminService.rejectReview(id)
  }

  /** Every tow truck, active or not — paginated, unlike the public listing */
  @Get('tow-trucks')
  listTowTrucks(@Query() query: AdminTowTrucksQuery): Promise<AdminTowTruckSummary[]> {
    return this.adminService.listTowTrucks(query)
  }

  /**
   * Totals for the header of that list. Additive: the list endpoint above
   * still returns a plain array, so nothing that already consumes it changes.
   *
   * Declared before any `tow-trucks/:id` route so `count` can never be read as
   * an id — there is no such GET route today, and this keeps it that way if
   * one is ever added.
   */
  @Get('tow-trucks/count')
  countTowTrucks(): Promise<{ total: number; active: number; inactive: number }> {
    return this.adminService.countTowTrucks()
  }

  /**
   * Every driver's payment status, for the dedicated `/admin/payments` page —
   * not the vehicle listing. Deliberately its own lean shape (AdminPaymentSummary)
   * rather than fields bolted onto AdminTowTruckSummary, same reasoning as
   * `count` above: unpaginated and one purpose. `?search=` matches name or
   * phone server-side (see `AdminPaymentsQuery`), so the search box on that
   * page works over every driver regardless of how large the table gets.
   *
   * Also declared before any `tow-trucks/:id` route for the same reason `count`
   * is — so `payments` can never be read as an id.
   */
  @Get('tow-trucks/payments')
  listTowTruckPayments(@Query() query: AdminPaymentsQuery): Promise<AdminPaymentSummary[]> {
    return this.adminService.listTowTruckPayments(query.search)
  }

  /**
   * Deactivate/reactivate — non-destructive, reversible, hides from public
   * listing. Deactivating requires a reason (see SetTowTruckActiveDto): it is
   * what the driver is then shown, and whether they can sign in at all.
   */
  @Patch('tow-trucks/:id/active')
  setActive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetTowTruckActiveDto,
  ): Promise<{ id: number; isActive: boolean }> {
    return this.adminService.setTowTruckActive(id, dto.isActive, dto.reason)
  }

  /** Toggle the homepage "best tow trucks" pick — purely editorial */
  @Patch('tow-trucks/:id/featured')
  setFeatured(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetTowTruckFeaturedDto,
  ): Promise<{ id: number; isFeatured: boolean }> {
    return this.adminService.setTowTruckFeatured(id, dto.isFeatured)
  }

  /**
   * Toggle "can move heavy machinery" — what puts this truck on
   * `/tsanr-tehnika`. Unlike `/featured` this is not editorial: it changes
   * public listing results.
   *
   * Admin-only with no driver counterpart, unlike almost every other field on
   * a truck — see `derivesHeavyEquipment`. The response echoes the **derived**
   * value, which is `true` for a `heavy-duty` truck no matter what was sent,
   * so the panel re-renders from the answer rather than from its own guess.
   */
  @Patch('tow-trucks/:id/heavy-equipment')
  setHeavyEquipment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetTowTruckHeavyEquipmentDto,
  ): Promise<{ id: number; heavyEquipment: boolean }> {
    return this.adminService.setTowTruckHeavyEquipment(id, dto.heavyEquipment)
  }

  /* PATCH tow-trucks/:id/payment lived here — one boolean plus a date, writing
     TowTruck.lastPaymentAt. It could not express a 4-month plan (a boolean has
     no duration), so recording money is now
     POST /admin/subscription-payments, which names a PLAN. See
     subscriptions/admin-subscriptions.controller.ts. */


  /**
   * Corrects the main login phone — the driver's own dashboard can't touch
   * this field (see MyTowTruckService), so a typo made at registration would
   * otherwise be permanent. Rejects a value already used by another active
   * truck — see AdminService.setTowTruckPhone.
   */
  @Patch('tow-trucks/:id/phone')
  setPhone(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetTowTruckPhoneDto,
  ): Promise<{ id: number; phone: string }> {
    return this.adminService.setTowTruckPhone(id, dto.phone)
  }

  /**
   * Sets or corrects the truck's base parking coordinates — the input for the
   * "nearest evacuator" distance calculation.
   *
   * Unlike `/phone`, this is not an admin-only field: the driver can set it
   * from their own dashboard too (`PATCH /my/tow-truck/coordinates`, same body,
   * same rule). This route exists so support can fix a pair pasted in the wrong
   * order without asking the driver to log in.
   *
   * Three segments, so it cannot shadow — or be shadowed by — the two-segment
   * `tow-trucks/count` above; see admin.controller.count-route.spec.ts, which
   * asserts that as a general rule over the whole route table rather than for
   * today's list.
   */
  @Patch('tow-trucks/:id/coordinates')
  setCoordinates(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetCoordinatesDto,
  ): Promise<{ id: number; latitude: number; longitude: number; locationUpdatedAt: string }> {
    return this.adminService.setTowTruckCoordinates(id, dto.latitude, dto.longitude)
  }

  /**
   * Sets which single place the truck is **based** in, plus the label the cards
   * show for it.
   *
   * Not cosmetic: city listings put locally-based drivers above the ones who
   * merely also cover the town, so this decides who a customer sees first. It
   * used to be inferred at approval from whichever served area came first —
   * arbitrary, and uncorrectable afterwards. See SetPrimaryAreaDto.
   */
  @Patch('tow-trucks/:id/primary-area')
  setPrimaryArea(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetPrimaryAreaDto,
  ): Promise<{
    id: number
    locationName: string
    citySlug?: string
    districtSlug?: string
    regionSlug?: string
  }> {
    return this.adminService.setTowTruckPrimaryArea(id, dto)
  }

  /**
   * Removes ONE area from a truck's served-areas list.
   *
   * PATCH rather than `DELETE .../service-areas/:slug`: the request sometimes
   * has to carry a replacement structural placement (when the removed area is
   * the truck's own city/district), and a DELETE with a body is the kind of
   * thing an intermediary is entitled to strip.
   *
   * It takes the slug to remove, NOT the new list — so the endpoint can only
   * ever shrink the coverage, which is what makes it safe to skip the coverage
   * cap here. See RemoveServiceAreaDto and AdminService for both arguments.
   *
   * Three segments, so no shadowing risk against `tow-trucks/count` — the same
   * argument as `/coordinates` above, asserted for the whole route table by
   * admin.controller.count-route.spec.ts.
   */
  @Patch('tow-trucks/:id/service-areas')
  removeServiceArea(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RemoveServiceAreaDto,
  ): Promise<{
    id: number
    serviceAreas: ServiceAreaJson[]
    citySlug?: string
    districtSlug?: string
    regionSlug?: string
  }> {
    return this.adminService.removeTowTruckServiceArea(id, dto)
  }

  /** Permanently deletes the tow truck + its images/reviews. Irreversible. */
  @Delete('tow-trucks/:id')
  deleteTowTruck(@Param('id', ParseIntPipe) id: number): Promise<{ id: number }> {
    return this.adminService.deleteTowTruck(id)
  }
}
