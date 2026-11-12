/**
 * Driver mobile app API — `/api/v1/driver-app/*`.
 *
 * Login (FleetAccess.authenticate): a website driver signs in with the SAME
 * website password — one account, no second password — but whether they may
 * use the app is decided ONLY by their app access, never by the website
 * status (a driver taken off the site can still work in the app, and vice
 * versa). App-only drivers sign in with their own password. The app then gets
 * its own token bound to a revocable device session.
 */
import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, Put, Query, Req, Res, UseFilters, UseGuards } from '@nestjs/common'
import { loginAttempts } from '../../common/login-attempts'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { DriverAuthService } from '../../driver-auth/driver-auth.service'
import { SetCoordinatesDto } from '../../common/set-coordinates.dto'
import { ChangePasswordDto } from '../../driver-auth/dto/change-password.dto'
import { UpdateMyTowTruckDto } from '../../my-tow-truck/dto/update-my-tow-truck.dto'
import { MyTowTruckService } from '../../my-tow-truck/my-tow-truck.service'
import { ConsentRequestContextService } from '../../privacy-consent/consent-request-context'
import { toDriverProfileChangeStatus } from '../../profile-changes/profile-change.mapper'
import { ProfileChangesService } from '../../profile-changes/profile-changes.service'
import { CreateAppRegistrationDto } from '../../registration/dto/create-app-registration.dto'
import { RegistrationService } from '../../registration/registration.service'
import { SubscriptionActiveGuard } from '../../subscriptions/subscription-active.guard'
import { toTowTruckApi } from '../../tow-trucks/tow-truck.mapper'
import { TowTrucksRepository } from '../../tow-trucks/tow-trucks.repository'
import { isAlertSound } from '../notify/push.service'
import { DispatchError } from '../platform/errors'
import { DRIVER_APP_AUDIENCE, DriverAppGuard, type DriverAppRequest } from './auth'
import { DispatchErrorFilter, intParam, mutationContext, send } from './http'
import { LiveDispatchRuntimeHolder } from './runtime.provider'
import { DriverAppSiteProfileGuard, type DriverAppSiteRequest } from './site-profile.guard'
import { SiteListingService } from '../../site-listing/site-listing.service'
import { WalletPayLinks } from './wallet-payments'

const APP_TOKEN_TTL = '30d'

@Controller('driver-app')
@UseFilters(DispatchErrorFilter)
export class DriverAppController {
  constructor(
    private readonly holder: LiveDispatchRuntimeHolder,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    // The website's own profile services — the app reuses them as they are,
    // so registration, moderation and the password rules exist once.
    private readonly registrations: RegistrationService,
    private readonly consentContext: ConsentRequestContextService,
    private readonly myTowTruck: MyTowTruckService,
    private readonly profileChanges: ProfileChangesService,
    private readonly towTrucks: TowTrucksRepository,
    private readonly driverAuth: DriverAuthService,
    private readonly payLinks: WalletPayLinks,
    private readonly siteListing: SiteListingService,
  ) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('sessions')
  @HttpCode(201)
  async login(
    @Body() body: { phone?: string; password?: string; deviceId?: string; platform?: string; appVersion?: string },
  ) {
    if (typeof body?.phone !== 'string' || typeof body.password !== 'string') throw new DispatchError('VALIDATION_FAILED', { field: 'phone/password' })
    if (typeof body.deviceId !== 'string' || body.deviceId.length < 8 || body.deviceId.length > 128) throw new DispatchError('VALIDATION_FAILED', { field: 'deviceId' })
    if (body.platform !== 'ios' && body.platform !== 'android') throw new DispatchError('VALIDATION_FAILED', { field: 'platform' })
    // The website row is checked first (its password only — not its status),
    // then app ACCESS. A number not on the site is an app-only account.
    // Wrong passwords are counted per ACCOUNT, not only per IP (common/login-attempts.ts)
    const attemptKey = `app:${body.phone.trim()}`
    if (loginAttempts.retryAfterSeconds(attemptKey) > 0) throw new DispatchError('RATE_LIMITED')
    const identity = await this.holder.runtime.access.authenticate(body.phone, body.password).catch((error: unknown) => {
      if (error instanceof DispatchError && error.code === 'INVALID_CREDENTIALS') loginAttempts.failed(attemptKey)
      throw error
    })
    loginAttempts.succeeded(attemptKey)
    const { session } = await this.holder.runtime.fleet.createSession({
      driverId: identity.driverId,
      deviceId: body.deviceId,
      platform: body.platform,
      appVersion: typeof body.appVersion === 'string' ? body.appVersion.slice(0, 32) : null,
    })
    const token = await this.jwt.signAsync(
      { sub: identity.driverId, sid: session.id },
      { secret: this.config.getOrThrow<string>('driverJwtSecret'), expiresIn: APP_TOKEN_TTL, audience: DRIVER_APP_AUDIENCE },
    )
    return {
      token,
      sessionId: session.id,
      driverId: identity.driverId,
      kind: identity.kind,
      // The website password is still the one we generated: the app may
      // remind the driver to change it on the website. Always false for app-only.
      mustChangePassword: identity.mustChangePassword,
    }
  }

  /**
   * Sign-up for a driver who is NOT on the website. Creates nothing public:
   * the account waits for an admin (PENDING_REVIEW) and cannot sign in until
   * approved. A number already on the website is refused with a pointer to
   * the site login instead — never a second account for the same driver.
   */
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('registrations')
  @HttpCode(201)
  register(@Body() body: Record<string, unknown>) {
    return this.holder.runtime.access.register({
      phone: body?.phone,
      password: body?.password,
      driverName: body?.driverName,
      vehicleType: body?.vehicleType,
      capacityTons: body?.capacityTons,
      maxLoadTons: body?.maxLoadTons,
      manipulator: body?.manipulator,
      wheelSkates: body?.wheelSkates,
      vehicleDescription: body?.vehicleDescription,
      baseLatitude: body?.baseLatitude,
      baseLongitude: body?.baseLongitude,
    })
  }

  /**
   * The app's sign-up (2026-11): the WEBSITE's registration — same form, same
   * photos (`POST /images` first), same consent, same moderation queue, and a
   * public profile on approval — plus a password the driver chooses, so they
   * can sign in to the app once approved. See CreateAppRegistrationDto.
   *
   * The app-account checks run first (FleetAccess knows app accounts, the
   * website's service does not), then `RegistrationService.submit` exactly as
   * `POST /registrations` calls it. The older app-only sign-up above stays for
   * builds already installed.
   */
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post('site-registrations')
  @HttpCode(201)
  async registerOnSite(@Body() dto: CreateAppRegistrationDto, @Req() request: Request) {
    const account = await this.holder.runtime.access.prepareSiteRegistration(dto.phone, dto.password)
    return this.registrations.submit(dto, this.consentContext.from(request), account)
  }

  /**
   * The driver's own profile. A website driver gets their website profile —
   * the same shape the website dashboard reads, coordinates included — plus
   * the state of their moderation queue; an app-only driver gets their app
   * account. A website profile switched off on the site is still SHOWN (the
   * app and the site are independent), only not editable: editing it is the
   * website dashboard's rule, enforced again by ProfileChangesService.
   */
  @UseGuards(DriverAppGuard)
  @Get('me/profile')
  async profile(@Req() req: DriverAppRequest) {
    const access = this.holder.runtime.access
    const towTruckId = await access.towTruckIdOf(req.driverId)
    if (towTruckId === null) {
      const view = await access.get(req.driverId)
      return {
        kind: 'APP_ONLY' as const,
        appAccount: {
          driverName: view.driverName,
          phone: view.phone,
          vehicleType: view.vehicleType,
          capacityTons: view.capacityTons,
          wheelSkates: view.wheelSkates,
          vehicleDescription: view.vehicleDescription,
          createdAt: view.createdAt.toISOString(),
        },
      }
    }
    try {
      const profile = await this.myTowTruck.getMine(towTruckId)
      const change = toDriverProfileChangeStatus(await this.profileChanges.getStatusForDriver(towTruckId))
      const site = await this.siteListing.viewFor(towTruckId)
      return { kind: 'SITE_LINKED' as const, siteActive: site.state === 'LISTED', site, profile, change }
    } catch (error) {
      if (!(error instanceof ForbiddenException)) throw error
      const truck = await this.towTrucks.findById(towTruckId)
      if (!truck) throw new DispatchError('TOW_TRUCK_NOT_FOUND')
      return {
        kind: 'SITE_LINKED' as const,
        siteActive: false,
        site: await this.siteListing.viewFor(towTruckId),
        profile: toTowTruckApi(truck, { includeCoordinates: true, includeOwnerFields: true }),
        change: { pending: null, lastReviewed: null },
      }
    }
  }

  /**
   * "I want to be on the website too": an app-only driver asks an admin to
   * publish their profile (SiteListingService). Returns the new site state.
   */
  @UseGuards(DriverAppGuard, DriverAppSiteProfileGuard)
  @Post('me/site-listing')
  requestSiteListing(@Req() req: DriverAppSiteRequest, @Body() body: { note?: unknown }) {
    return this.siteListing.request(req.towTruckId, body?.note)
  }

  /** A one-time t.me link to connect Telegram — only once the profile is on the site */
  @UseGuards(DriverAppGuard, DriverAppSiteProfileGuard)
  @Post('me/telegram-link')
  telegramLink(@Req() req: DriverAppSiteRequest) {
    return this.siteListing.telegramLink(req.towTruckId)
  }

  /**
   * Submits the profile for review — `PATCH /my/tow-truck`, from the app. It
   * queues a diff, it does not write; the response is the queue status. Behind
   * the same `SubscriptionActiveGuard` (402 when the subscription lapsed).
   */
  @UseGuards(DriverAppGuard, DriverAppSiteProfileGuard, SubscriptionActiveGuard)
  @Put('me/profile')
  async updateProfile(@Req() req: DriverAppSiteRequest, @Body() dto: UpdateMyTowTruckDto) {
    const pending = await this.profileChanges.submitProfileChange(req.towTruckId, dto)
    return toDriverProfileChangeStatus({ pending, lastReviewed: null })
  }

  /**
   * The base parking coordinates, on their own — `PATCH /my/tow-truck/coordinates`
   * from the app. Moderated like every other field (queued, not written).
   */
  @UseGuards(DriverAppGuard, DriverAppSiteProfileGuard, SubscriptionActiveGuard)
  @Put('me/profile/coordinates')
  async updateCoordinates(@Req() req: DriverAppSiteRequest, @Body() dto: SetCoordinatesDto) {
    const pending = await this.profileChanges.submitCoordinatesChange(req.towTruckId, dto)
    return toDriverProfileChangeStatus({ pending, lastReviewed: null })
  }

  /** Withdraws the queued profile edit (nothing was ever applied) */
  @UseGuards(DriverAppGuard, DriverAppSiteProfileGuard)
  @Delete('me/profile/change')
  withdrawProfileChange(@Req() req: DriverAppSiteRequest) {
    return this.profileChanges.withdraw(req.towTruckId)
  }

  /**
   * Changes the website password — which IS the app password for a website
   * driver. `DriverAuthService.changePassword`, unchanged: wrong current
   * password is a 400 there, never a 401, so the app does not read it as a
   * revoked session.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(DriverAppGuard, DriverAppSiteProfileGuard)
  @Put('me/password')
  @HttpCode(204)
  async changePassword(@Req() req: DriverAppSiteRequest, @Body() dto: ChangePasswordDto): Promise<void> {
    // The app keeps its own session; the new website token is not its business
    await this.driverAuth.changePassword(req.towTruckId, dto.currentPassword, dto.newPassword)
  }

  @UseGuards(DriverAppGuard)
  @Delete('sessions/current')
  @HttpCode(204)
  async logout(@Req() req: DriverAppRequest): Promise<void> {
    await this.holder.runtime.fleet.revokeSession(req.sessionId, 'LOGOUT')
  }

  @UseGuards(DriverAppGuard)
  @Post('consent/tracking')
  @HttpCode(204)
  async consent(@Req() req: DriverAppRequest, @Body() body: { version?: number }): Promise<void> {
    await this.holder.runtime.fleet.recordTrackingConsent(req.driverId, Number(body?.version))
  }

  /** Withdraws location consent (and goes offline) — see FleetRepository.withdrawTrackingConsent */
  @UseGuards(DriverAppGuard)
  @Delete('consent/tracking')
  @HttpCode(204)
  async withdrawConsent(@Req() req: DriverAppRequest): Promise<void> {
    await this.holder.runtime.fleet.withdrawTrackingConsent(req.driverId)
  }

  /** The driver deletes his own app account; the password is asked again. See FleetAccess.deleteOwnAccount */
  @UseGuards(DriverAppGuard)
  // Re-asks the password: throttled like login, so a stolen token cannot be
  // used to guess it.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/delete')
  @HttpCode(204)
  async deleteAccount(@Req() req: DriverAppRequest, @Body() body: { password?: unknown }): Promise<void> {
    await this.holder.runtime.access.deleteOwnAccount(req.driverId, body?.password)
  }

  @UseGuards(DriverAppGuard)
  @Get('me')
  snapshot(@Req() req: DriverAppRequest) {
    return this.holder.service.driverSnapshot(req.driverId)
  }

  @UseGuards(DriverAppGuard)
  @Put('me/availability')
  async availability(@Req() req: DriverAppRequest, @Body() body: { wantsOnline?: boolean; externalBusy?: boolean }) {
    const change: { wantsOnline?: boolean; externalBusy?: boolean } = {}
    if (typeof body?.wantsOnline === 'boolean') change.wantsOnline = body.wantsOnline
    if (typeof body?.externalBusy === 'boolean') change.externalBusy = body.externalBusy
    if (Object.keys(change).length === 0) throw new DispatchError('VALIDATION_FAILED', { field: 'wantsOnline/externalBusy' })
    await this.holder.runtime.fleet.setAvailability(req.driverId, req.sessionId, change)
    return this.holder.service.driverSnapshot(req.driverId)
  }

  @UseGuards(DriverAppGuard)
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post('me/heartbeat')
  heartbeat(@Req() req: DriverAppRequest) {
    return this.holder.runtime.fleet.heartbeat(req.driverId, req.sessionId)
  }

  @UseGuards(DriverAppGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('me/locations')
  locations(@Req() req: DriverAppRequest, @Body() body: { fixes?: unknown }) {
    if (!Array.isArray(body?.fixes)) throw new DispatchError('VALIDATION_FAILED', { field: 'fixes' })
    return this.holder.service.ingestLocations(req.driverId, req.sessionId, body.fixes as never)
  }

  @UseGuards(DriverAppGuard)
  @Post('me/push-token')
  @HttpCode(204)
  async pushToken(@Req() req: DriverAppRequest, @Body() body: { token?: string; sound?: unknown }): Promise<void> {
    if (typeof body?.token !== 'string') throw new DispatchError('VALIDATION_FAILED', { field: 'token' })
    // Optional: the driver's new-order ring on this phone (iOS plays the file the push names)
    if (body.sound !== undefined && !isAlertSound(body.sound)) throw new DispatchError('VALIDATION_FAILED', { field: 'sound' })
    await this.holder.runtime.fleet.registerPushToken(req.sessionId, req.driverId, body.token, body.sound)
  }

  @UseGuards(DriverAppGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('offers/:offerId/accept')
  async accept(@Req() req: DriverAppRequest & Request, @Param('offerId') offerId: string, @Body() body: unknown, @Res() res: Response) {
    send(res, await this.holder.service.driverAccept(req.driverId, offerId, mutationContext(req, body ?? {})))
  }

  @UseGuards(DriverAppGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('offers/:offerId/reject')
  async reject(@Req() req: DriverAppRequest & Request, @Param('offerId') offerId: string, @Body() body: { reason?: string }, @Res() res: Response) {
    const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 200) : null
    send(res, await this.holder.service.driverReject(req.driverId, offerId, reason, mutationContext(req, body ?? {})))
  }

  /** The app rendered the offer (delivery fact — NOT an acceptance) */
  @UseGuards(DriverAppGuard)
  @Post('offers/:offerId/ack')
  @HttpCode(200)
  // 200 + the deadline once the answer window started (2026-11): the phone's
  // alarm rings until then. Old app builds ignore the body.
  async ack(@Req() req: DriverAppRequest, @Param('offerId') offerId: string, @Body() body: { channel?: string }): Promise<{ expiresAt: string | null }> {
    const channel = body?.channel === 'REALTIME' ? 'REALTIME' : 'PUSH'
    const rt = this.holder.runtime
    return rt.offers.acknowledgeDelivery(offerId, req.driverId, channel, await rt.settings.get())
  }

  @UseGuards(DriverAppGuard)
  @Post('orders/:orderId/progress')
  async progress(@Req() req: DriverAppRequest & Request, @Param('orderId') orderId: string, @Body() body: { action?: string }, @Res() res: Response) {
    const action = body?.action
    if (action !== 'EN_ROUTE' && action !== 'ARRIVED' && action !== 'START_TRANSPORT' && action !== 'COMPLETE') {
      throw new DispatchError('VALIDATION_FAILED', { field: 'action' })
    }
    send(res, await this.holder.service.driverProgress(req.driverId, intParam(orderId, 'orderId'), action, mutationContext(req, body)))
  }

  @UseGuards(DriverAppGuard)
  @Post('orders/:orderId/price')
  async price(@Req() req: DriverAppRequest & Request, @Param('orderId') orderId: string, @Body() body: { agreedPriceAmd?: unknown }, @Res() res: Response) {
    send(res, await this.holder.service.driverConfirmPrice(req.driverId, intParam(orderId, 'orderId'), Number(body?.agreedPriceAmd), mutationContext(req, body)))
  }

  @UseGuards(DriverAppGuard)
  @Post('orders/:orderId/requests')
  async request(@Req() req: DriverAppRequest & Request, @Param('orderId') orderId: string, @Body() body: unknown, @Res() res: Response) {
    send(res, await this.holder.service.driverRequest(req.driverId, intParam(orderId, 'orderId'), body, mutationContext(req, body)))
  }

  @UseGuards(DriverAppGuard)
  @Get('orders/history')
  history(@Req() req: DriverAppRequest, @Query('limit') limit?: string, @Query('before') before?: string) {
    const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : null
    return this.holder.service.driverHistory(req.driverId, Number(limit ?? 20), beforeDate)
  }

  /** Offers he let run out («Բաց թողնված»), newest first; `before` = the last item's `offeredAt` */
  @UseGuards(DriverAppGuard)
  @Get('orders/missed')
  missed(@Req() req: DriverAppRequest, @Query('limit') limit?: string, @Query('before') before?: string) {
    const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : null
    const n = Number(limit ?? 20)
    return this.holder.service.driverMissedOffers(req.driverId, Number.isFinite(n) ? n : 20, beforeDate)
  }

  // ─── Wallet (2026-11-12) ──────────────────────────────────────────────────

  /** Balance, fee schedule, the first statement page and recent top-ups */
  @UseGuards(DriverAppGuard)
  @Get('me/wallet')
  async wallet(@Req() req: DriverAppRequest) {
    return { ...(await this.holder.service.driverWallet(req.driverId)), topupAvailable: this.payLinks.available }
  }

  /** Older statement lines; `before` = the last line's id */
  @UseGuards(DriverAppGuard)
  @Get('me/wallet/entries')
  walletEntries(@Req() req: DriverAppRequest, @Query('limit') limit?: string, @Query('before') before?: string) {
    const beforeId = before && /^\d+$/.test(before) ? Number(before) : null
    const n = Number(limit ?? 30)
    return this.holder.service.driverWalletEntries(req.driverId, Number.isFinite(n) ? n : 30, beforeId)
  }

  /**
   * A new Idram bill for the wallet, and the link the app opens in the
   * phone's browser to pay it (`payUrl`, valid 30 min). The credit arrives
   * with Idram's confirmation, not here: the app polls `me/wallet/topups/:id`.
   */
  @UseGuards(DriverAppGuard)
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @Post('me/wallet/topups')
  async createTopup(@Req() req: DriverAppRequest & Request, @Body() body: { amountAmd?: unknown }) {
    if (!this.payLinks.available) throw new DispatchError('WALLET_TOPUP_UNAVAILABLE', { reason: 'payments not configured' })
    const bill = await this.holder.service.driverCreateTopup(req.driverId, body?.amountAmd)
    const token = await this.payLinks.sign(bill.paymentId, req.driverId)
    const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol).split(',')[0].trim()
    const host = String(req.headers['x-forwarded-host'] ?? req.get('host'))
    const base = req.originalUrl.replace(/\/driver-app\/me\/wallet\/topups.*$/, '')
    return { ...bill, status: 'PENDING', payUrl: `${proto}://${host}${base}/driver-app/wallet/pay/${bill.paymentId}?t=${encodeURIComponent(token)}` }
  }

  @UseGuards(DriverAppGuard)
  @Get('me/wallet/topups/:paymentId')
  topup(@Req() req: DriverAppRequest, @Param('paymentId') paymentId: string) {
    return this.holder.service.driverTopup(req.driverId, intParam(paymentId, 'paymentId'))
  }

  /**
   * The page the phone's browser opens: it carries the driver on to Idram's
   * hosted payment page. Public (a browser has no app token) — the signed,
   * short-lived `t` stands in, and the amount always comes from our row.
   */
  @Get('wallet/pay/:paymentId')
  async payPage(@Param('paymentId') paymentId: string, @Query('t') token: string | undefined, @Res() res: Response) {
    const page = await this.payLinks.page(intParam(paymentId, 'paymentId'), token)
    res.status(page.status).setHeader('Content-Security-Policy', page.csp).setHeader('Content-Type', 'text/html; charset=utf-8').setHeader('Cache-Control', 'no-store').setHeader('Referrer-Policy', 'no-referrer').send(page.html)
  }
}
