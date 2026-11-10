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
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, Res, UseFilters, UseGuards } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { DispatchError } from '../platform/errors'
import { DRIVER_APP_AUDIENCE, DriverAppGuard, type DriverAppRequest } from './auth'
import { DispatchErrorFilter, intParam, mutationContext, send } from './http'
import { LiveDispatchRuntimeHolder } from './runtime.provider'

const APP_TOKEN_TTL = '30d'

@Controller('driver-app')
@UseFilters(DispatchErrorFilter)
export class DriverAppController {
  constructor(
    private readonly holder: LiveDispatchRuntimeHolder,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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
    const identity = await this.holder.runtime.access.authenticate(body.phone, body.password)
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
  async pushToken(@Req() req: DriverAppRequest, @Body() body: { token?: string }): Promise<void> {
    if (typeof body?.token !== 'string') throw new DispatchError('VALIDATION_FAILED', { field: 'token' })
    await this.holder.runtime.fleet.registerPushToken(req.sessionId, req.driverId, body.token)
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
  @HttpCode(204)
  async ack(@Req() req: DriverAppRequest, @Param('offerId') offerId: string, @Body() body: { channel?: string }): Promise<void> {
    const channel = body?.channel === 'REALTIME' ? 'REALTIME' : 'PUSH'
    await this.holder.runtime.offers.acknowledgeDelivery(offerId, req.driverId, channel)
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
}
