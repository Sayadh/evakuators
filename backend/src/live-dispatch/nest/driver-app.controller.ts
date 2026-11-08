/**
 * Driver mobile app API — `/api/v1/driver-app/*`.
 *
 * Login reuses the EXISTING driver credential check (DriverAuthService.login:
 * phone + password, bcrypt, the same deactivation rules), so there is one
 * account per driver and no second password. The app then gets its own token
 * bound to a revocable device session.
 */
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, Res, UseFilters, UseGuards } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { DriverAuthService } from '../../driver-auth/driver-auth.service'
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
    private readonly driverAuth: DriverAuthService,
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
    // Throws 401/403 exactly as the website login does.
    const web = await this.driverAuth.login(body.phone, body.password)
    const { session } = await this.holder.runtime.fleet.createSession({
      towTruckId: web.towTruckId,
      deviceId: body.deviceId,
      platform: body.platform,
      appVersion: typeof body.appVersion === 'string' ? body.appVersion.slice(0, 32) : null,
    })
    const token = await this.jwt.signAsync(
      { sub: web.towTruckId, sid: session.id },
      { secret: this.config.getOrThrow<string>('driverJwtSecret'), expiresIn: APP_TOKEN_TTL, audience: DRIVER_APP_AUDIENCE },
    )
    return {
      token,
      sessionId: session.id,
      towTruckId: web.towTruckId,
      mustChangePassword: web.mustChangePassword,
      requiresPrivacyConsent: web.requiresPrivacyConsent,
    }
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
    await this.holder.runtime.fleet.recordTrackingConsent(req.towTruckId, Number(body?.version))
  }

  @UseGuards(DriverAppGuard)
  @Get('me')
  snapshot(@Req() req: DriverAppRequest) {
    return this.holder.service.driverSnapshot(req.towTruckId)
  }

  @UseGuards(DriverAppGuard)
  @Put('me/availability')
  async availability(@Req() req: DriverAppRequest, @Body() body: { wantsOnline?: boolean; externalBusy?: boolean }) {
    const change: { wantsOnline?: boolean; externalBusy?: boolean } = {}
    if (typeof body?.wantsOnline === 'boolean') change.wantsOnline = body.wantsOnline
    if (typeof body?.externalBusy === 'boolean') change.externalBusy = body.externalBusy
    if (Object.keys(change).length === 0) throw new DispatchError('VALIDATION_FAILED', { field: 'wantsOnline/externalBusy' })
    await this.holder.runtime.fleet.setAvailability(req.towTruckId, req.sessionId, change)
    return this.holder.service.driverSnapshot(req.towTruckId)
  }

  @UseGuards(DriverAppGuard)
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post('me/heartbeat')
  heartbeat(@Req() req: DriverAppRequest) {
    return this.holder.runtime.fleet.heartbeat(req.towTruckId, req.sessionId)
  }

  @UseGuards(DriverAppGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('me/locations')
  locations(@Req() req: DriverAppRequest, @Body() body: { fixes?: unknown }) {
    if (!Array.isArray(body?.fixes)) throw new DispatchError('VALIDATION_FAILED', { field: 'fixes' })
    return this.holder.service.ingestLocations(req.towTruckId, req.sessionId, body.fixes as never)
  }

  @UseGuards(DriverAppGuard)
  @Post('me/push-token')
  @HttpCode(204)
  async pushToken(@Req() req: DriverAppRequest, @Body() body: { token?: string }): Promise<void> {
    if (typeof body?.token !== 'string') throw new DispatchError('VALIDATION_FAILED', { field: 'token' })
    await this.holder.runtime.fleet.registerPushToken(req.sessionId, req.towTruckId, body.token)
  }

  @UseGuards(DriverAppGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('offers/:offerId/accept')
  async accept(@Req() req: DriverAppRequest & Request, @Param('offerId') offerId: string, @Body() body: unknown, @Res() res: Response) {
    send(res, await this.holder.service.driverAccept(req.towTruckId, offerId, mutationContext(req, body ?? {})))
  }

  @UseGuards(DriverAppGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('offers/:offerId/reject')
  async reject(@Req() req: DriverAppRequest & Request, @Param('offerId') offerId: string, @Body() body: { reason?: string }, @Res() res: Response) {
    const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 200) : null
    send(res, await this.holder.service.driverReject(req.towTruckId, offerId, reason, mutationContext(req, body ?? {})))
  }

  /** The app rendered the offer (delivery fact — NOT an acceptance) */
  @UseGuards(DriverAppGuard)
  @Post('offers/:offerId/ack')
  @HttpCode(204)
  async ack(@Req() req: DriverAppRequest, @Param('offerId') offerId: string, @Body() body: { channel?: string }): Promise<void> {
    const channel = body?.channel === 'REALTIME' ? 'REALTIME' : 'PUSH'
    await this.holder.runtime.offers.acknowledgeDelivery(offerId, req.towTruckId, channel)
  }

  @UseGuards(DriverAppGuard)
  @Post('orders/:orderId/progress')
  async progress(@Req() req: DriverAppRequest & Request, @Param('orderId') orderId: string, @Body() body: { action?: string }, @Res() res: Response) {
    const action = body?.action
    if (action !== 'EN_ROUTE' && action !== 'ARRIVED' && action !== 'START_TRANSPORT' && action !== 'COMPLETE') {
      throw new DispatchError('VALIDATION_FAILED', { field: 'action' })
    }
    send(res, await this.holder.service.driverProgress(req.towTruckId, intParam(orderId, 'orderId'), action, mutationContext(req, body)))
  }

  @UseGuards(DriverAppGuard)
  @Post('orders/:orderId/requests')
  async request(@Req() req: DriverAppRequest & Request, @Param('orderId') orderId: string, @Body() body: unknown, @Res() res: Response) {
    send(res, await this.holder.service.driverRequest(req.towTruckId, intParam(orderId, 'orderId'), body, mutationContext(req, body)))
  }

  @UseGuards(DriverAppGuard)
  @Get('orders/history')
  history(@Req() req: DriverAppRequest, @Query('limit') limit?: string, @Query('before') before?: string) {
    const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : null
    return this.holder.service.driverHistory(req.towTruckId, Number(limit ?? 20), beforeDate)
  }
}
