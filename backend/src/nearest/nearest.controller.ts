import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request } from 'express'
import { FindNearestDto } from './dto/find-nearest.dto'
import { NEAREST_THROTTLE_LIMIT, NEAREST_THROTTLE_TTL_MS } from './nearest.constants'
import { NearestService } from './nearest.service'
import type { NearestSearchApi } from './nearest.types'

/**
 * Public — no auth, same as every other visitor-facing endpoint.
 *
 * Stricter throttle than the global 60/60s because a cache miss here can cost an
 * external matrix request against a metered daily quota. Ten per minute per IP
 * is far above what a person retrying a permission prompt produces, and far
 * below what would matter to the quota.
 *
 * `200`, not `201`: `@Post` defaults to 201 in Nest, and nothing is created —
 * the verb is a POST for the logging reason argued in FindNearestDto, not
 * because this is a write.
 */
@Controller('nearest-tow-trucks')
export class NearestController {
  constructor(private readonly nearestService: NearestService) {}

  /**
   * `req.ip` is the daily ceiling's key, and it is only a real client address
   * because `app.set('trust proxy', 1)` is set in main.ts — behind nginx,
   * Express reports `127.0.0.1` for everyone without it, which would make the
   * ceiling one global counter shared by the whole internet. That line is
   * load-bearing for the throttler too; see docs/auth-and-security.md
   * § Throttling.
   *
   * The `?? ''` is not defensive padding: `req.ip` is typed optional because
   * it can genuinely be undefined on a socket with no remote address. An empty
   * string is then one shared bucket for every such caller, which is the safe
   * direction — those requests are counted together rather than each getting a
   * fresh allowance.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: NEAREST_THROTTLE_LIMIT, ttl: NEAREST_THROTTLE_TTL_MS } })
  findNearest(@Body() dto: FindNearestDto, @Req() request: Request): Promise<NearestSearchApi> {
    return this.nearestService.findNearest(dto.latitude, dto.longitude, request.ip ?? '')
  }
}
