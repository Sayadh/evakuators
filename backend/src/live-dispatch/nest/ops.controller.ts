/**
 * Operator console API — `/api/v1/ops/dispatch/*`, ADMIN or DISPATCHER
 * (settings: ADMIN only). Separate from `/admin/*` on purpose: every route
 * there stays ADMIN-only under the unchanged AdminJwtGuard.
 */
import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseFilters, UseGuards } from '@nestjs/common'
import type { Request, Response } from 'express'
import { outboxHealth } from '../notify/outbox'
import type { AttentionKind } from '../orders/domain/order-state'
import { DispatchError } from '../platform/errors'
import { AdminOnly, OpsGuard, type OpsRequest } from './auth'
import { DispatchErrorFilter, intParam, mutationContext, send, versionOf } from './http'
import { LiveDispatchRuntimeHolder } from './runtime.provider'

type Req2 = OpsRequest & Request

@Controller('ops/dispatch')
@UseGuards(OpsGuard)
@UseFilters(DispatchErrorFilter)
export class OpsDispatchController {
  constructor(private readonly holder: LiveDispatchRuntimeHolder) {}

  private get service() {
    return this.holder.service
  }

  // ─── Orders ───────────────────────────────────────────────────────────────

  @Post('orders')
  async create(@Req() req: Req2, @Body() body: unknown, @Res() res: Response) {
    send(res, await this.service.createOrder(req.adminUserId, body, mutationContext(req, body)))
  }

  @Get('orders')
  list(@Query() query: { status?: string; search?: string; limit?: string; cursor?: string }) {
    return this.service.listOrders({ ...query, limit: query.limit ? Number(query.limit) : undefined })
  }

  @Get('orders/:id')
  detail(@Param('id') id: string) {
    return this.service.orderDetail(intParam(id, 'id'))
  }

  @Patch('orders/:id')
  async update(@Req() req: Req2, @Param('id') id: string, @Body() body: unknown, @Res() res: Response) {
    send(res, await this.service.updateOrder(req.adminUserId, intParam(id, 'id'), body, mutationContext(req, body)))
  }

  @Post('orders/:id/start')
  async start(@Req() req: Req2, @Param('id') id: string, @Body() body: unknown, @Res() res: Response) {
    send(res, await this.service.startDispatch(req.adminUserId, intParam(id, 'id'), versionOf(body), mutationContext(req, body)))
  }

  @Post('orders/:id/stop')
  async stop(@Req() req: Req2, @Param('id') id: string, @Body() body: unknown, @Res() res: Response) {
    send(res, await this.service.stopDispatch(req.adminUserId, intParam(id, 'id'), versionOf(body), mutationContext(req, body)))
  }

  @Post('orders/:id/cancel')
  async cancel(@Req() req: Req2, @Param('id') id: string, @Body() body: unknown, @Res() res: Response) {
    send(res, await this.service.cancelOrder(req.adminUserId, intParam(id, 'id'), body, mutationContext(req, body)))
  }

  @Post('orders/:id/confirm-price')
  async confirmPrice(@Req() req: Req2, @Param('id') id: string, @Body() body: { agreedPriceAmd?: number }, @Res() res: Response) {
    send(res, await this.service.confirmPrice(req.adminUserId, intParam(id, 'id'), Number(body?.agreedPriceAmd), versionOf(body), mutationContext(req, body)))
  }

  @Post('orders/:id/payment')
  async payment(@Req() req: Req2, @Param('id') id: string, @Body() body: { status?: 'UNKNOWN' | 'UNPAID' | 'PAID' }, @Res() res: Response) {
    send(res, await this.service.setPayment(req.adminUserId, intParam(id, 'id'), body?.status as never, versionOf(body), mutationContext(req, body)))
  }

  @Post('orders/:id/progress')
  async progress(@Req() req: Req2, @Param('id') id: string, @Body() body: { action?: string }, @Res() res: Response) {
    const action = body?.action
    if (action !== 'EN_ROUTE' && action !== 'ARRIVED' && action !== 'START_TRANSPORT' && action !== 'COMPLETE') {
      throw new DispatchError('VALIDATION_FAILED', { field: 'action' })
    }
    send(res, await this.service.adminProgress(req.adminUserId, intParam(id, 'id'), action, versionOf(body), mutationContext(req, body)))
  }

  @Post('orders/:id/release')
  async release(
    @Req() req: Req2,
    @Param('id') id: string,
    @Body() body: { confirm?: boolean; reason?: string; restartSearch?: boolean },
    @Res() res: Response,
  ) {
    send(
      res,
      await this.service.releaseAssignment(
        req.adminUserId,
        intParam(id, 'id'),
        { confirm: body?.confirm as true, reason: String(body?.reason ?? ''), restartSearch: Boolean(body?.restartSearch), expectedVersion: versionOf(body) },
        mutationContext(req, body),
      ),
    )
  }

  @Post('orders/:id/resume')
  async resume(@Req() req: Req2, @Param('id') id: string, @Body() body: { note?: string }, @Res() res: Response) {
    send(res, await this.service.resume(req.adminUserId, intParam(id, 'id'), String(body?.note ?? ''), versionOf(body), mutationContext(req, body)))
  }

  @Post('orders/:id/flag')
  async flag(@Req() req: Req2, @Param('id') id: string, @Body() body: { kind?: AttentionKind; note?: string }, @Res() res: Response) {
    send(res, await this.service.flag(req.adminUserId, intParam(id, 'id'), body?.kind ?? 'OPERATOR_FLAG', String(body?.note ?? ''), versionOf(body), mutationContext(req, body)))
  }

  @Post('orders/:id/override-requirements')
  async override(@Req() req: Req2, @Param('id') id: string, @Body() body: { note?: string }, @Res() res: Response) {
    send(res, await this.service.overrideRequirements(req.adminUserId, intParam(id, 'id'), String(body?.note ?? ''), versionOf(body), mutationContext(req, body)))
  }

  @Post('orders/:id/manual-offer')
  async manualOffer(@Req() req: Req2, @Param('id') id: string, @Body() body: { driverId?: number; overrideReason?: string }, @Res() res: Response) {
    send(
      res,
      await this.service.manualOffer(
        req.adminUserId,
        intParam(id, 'id'),
        { driverId: Number(body?.driverId), overrideReason: body?.overrideReason ?? null, expectedVersion: versionOf(body) },
        mutationContext(req, body),
      ),
    )
  }

  @Post('orders/:id/route')
  computeRoute(@Req() req: Req2, @Param('id') id: string) {
    return this.service.computeOrderRoute(req.adminUserId, intParam(id, 'id'))
  }

  @Post('orders/:id/route/manual')
  manualRoute(@Req() req: Req2, @Param('id') id: string, @Body() body: { meters?: number; seconds?: number | null }) {
    return this.service.setManualRoute(req.adminUserId, intParam(id, 'id'), Number(body?.meters), body?.seconds == null ? null : Number(body.seconds))
  }

  // ─── Fleet ────────────────────────────────────────────────────────────────

  @Get('drivers/map')
  map(@Query() query: { bbox?: string; onlyOnline?: string; limit?: string; offset?: string }) {
    return this.service.driverMap({
      bbox: query.bbox,
      onlyOnline: query.onlyOnline === 'true',
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    })
  }

  @Post('drivers/:driverId/suspend')
  async suspend(@Req() req: Req2, @Param('driverId') driverId: string, @Body() body: { suspended?: boolean; reason?: string }) {
    if (typeof body?.suspended !== 'boolean') throw new DispatchError('VALIDATION_FAILED', { field: 'suspended' })
    await this.holder.runtime.fleet.setDispatchSuspended(intParam(driverId, 'driverId'), body.suspended, body.reason ?? null, req.adminUserId)
    return { ok: true }
  }

  // ─── App access (who may use the driver app) — ADMIN only ───────────────
  //
  // Separate from the dispatch pause above: `drivers/:id/suspend` is an
  // operator pausing ORDERS for a while; these decide whether the person may
  // use the app at all.

  @AdminOnly()
  @Get('fleet')
  fleetList(@Query() query: { status?: string; kind?: string; q?: string; limit?: string; offset?: string }) {
    const status = ['PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'REJECTED'].includes(query.status ?? '') ? (query.status as never) : undefined
    const kind = ['SITE_LINKED', 'APP_ONLY'].includes(query.kind ?? '') ? (query.kind as never) : undefined
    return this.holder.runtime.access.list({
      status,
      kind,
      q: query.q,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    })
  }

  @AdminOnly()
  @Get('fleet/site-candidates')
  siteCandidates(@Query('q') q?: string) {
    return this.holder.runtime.access.siteCandidates(q ?? '')
  }

  @AdminOnly()
  @Get('fleet/:id')
  fleetDetail(@Param('id') id: string) {
    return this.holder.runtime.access.get(intParam(id, 'id'))
  }

  @AdminOnly()
  @Post('fleet/grant')
  grant(@Req() req: Req2, @Body() body: { towTruckId?: unknown }) {
    return this.holder.runtime.access.grantSiteAccess(intParam(String(body?.towTruckId ?? ''), 'towTruckId'), req.adminUserId)
  }

  @AdminOnly()
  @Post('fleet/:id/approve')
  approve(@Req() req: Req2, @Param('id') id: string) {
    return this.holder.runtime.access.approve(intParam(id, 'id'), req.adminUserId)
  }

  @AdminOnly()
  @Post('fleet/:id/reject')
  reject(@Req() req: Req2, @Param('id') id: string, @Body() body: { reason?: unknown }) {
    return this.holder.runtime.access.reject(intParam(id, 'id'), body?.reason, req.adminUserId)
  }

  @AdminOnly()
  @Post('fleet/:id/suspend')
  suspendAccess(@Req() req: Req2, @Param('id') id: string, @Body() body: { reason?: unknown }) {
    return this.holder.runtime.access.suspend(intParam(id, 'id'), body?.reason, req.adminUserId)
  }

  @AdminOnly()
  @Post('fleet/:id/reactivate')
  reactivate(@Req() req: Req2, @Param('id') id: string) {
    return this.holder.runtime.access.reactivate(intParam(id, 'id'), req.adminUserId)
  }

  /** A driver asked (by phone etc.) to delete his app account — see /driver-app/delete-account */
  @AdminOnly()
  @Post('fleet/:id/delete-account')
  deleteAccount(@Req() req: Req2, @Param('id') id: string) {
    return this.holder.runtime.access.deleteAccountOnRequest(intParam(id, 'id'), req.adminUserId)
  }

  @AdminOnly()
  @Post('fleet/:id/link-site')
  linkSite(@Req() req: Req2, @Param('id') id: string, @Body() body: { towTruckId?: unknown }) {
    return this.holder.runtime.access.linkToSite(intParam(id, 'id'), intParam(String(body?.towTruckId ?? ''), 'towTruckId'), req.adminUserId)
  }

  // ─── Alerts, settings, health ─────────────────────────────────────────────

  @Get('alerts')
  alerts(@Query('limit') limit?: string) {
    return this.holder.runtime.orders.openAlerts(Number(limit ?? 100))
  }

  @Post('alerts/:id/ack')
  async ackAlert(@Req() req: Req2, @Param('id') id: string) {
    await this.holder.runtime.orders.acknowledgeAlert(intParam(id, 'id'), req.adminUserId)
    return { ok: true }
  }

  @Get('settings')
  settings() {
    return this.holder.runtime.settings.get()
  }

  @AdminOnly()
  @Patch('settings')
  updateSettings(@Req() req: Req2, @Body() body: Record<string, unknown>) {
    return this.holder.runtime.settings.update(body ?? {}, req.adminUserId)
  }

  @Get('health')
  async health() {
    const outbox = await outboxHealth(this.holder.runtime.db)
    return { flags: { dispatch: this.holder.runtime.config.enabled, tracking: this.holder.runtime.config.trackingEnabled }, outbox }
  }
}
