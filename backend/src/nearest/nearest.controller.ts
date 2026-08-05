import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
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

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: NEAREST_THROTTLE_LIMIT, ttl: NEAREST_THROTTLE_TTL_MS } })
  findNearest(@Body() dto: FindNearestDto): Promise<NearestSearchApi> {
    return this.nearestService.findNearest(dto.latitude, dto.longitude)
  }
}
