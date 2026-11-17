import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard'
import { ClientErrorDto } from './client-error.dto'
import { ErrorTrackingService, type ErrorGroupView } from './error-tracking.service'

@Controller()
export class ErrorTrackingController {
  constructor(private readonly errors: ErrorTrackingService) {}

  /**
   * Reports from the admin pages and the driver app. Public on purpose — the
   * app crashes before sign-in too — so it is throttled per IP, and the store
   * stops taking NEW kinds of error past MAX_OPEN_GROUPS (a counter on an
   * existing one costs nothing). Always 204: a reporter never retries.
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('errors/client')
  @HttpCode(204)
  async client(@Body() dto: ClientErrorDto): Promise<void> {
    await this.errors.record({
      source: dto.source,
      message: dto.message,
      stack: dto.stack ?? null,
      release: dto.release ?? null,
      context: { ...(dto.context ?? {}), ...(dto.where ? { where: dto.where } : {}) },
    })
  }

  @UseGuards(AdminJwtGuard)
  @Get('admin/errors')
  list(@Query('status') status?: string): Promise<ErrorGroupView[]> {
    return this.errors.list(status === 'resolved' ? 'resolved' : 'open')
  }

  @UseGuards(AdminJwtGuard)
  @Post('admin/errors/:id/resolve')
  @HttpCode(200)
  resolve(@Param('id', ParseIntPipe) id: number): Promise<{ resolved: boolean }> {
    return this.errors.resolve(id)
  }
}
