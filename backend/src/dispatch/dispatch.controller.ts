import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard'
import type { AuthenticatedAdminRequest } from '../admin-auth/admin-jwt.guard'
import { DISPATCH_FILTERS, type DispatchFilter, type DispatchLocationType } from './dispatch-ranking'
import { DispatchService } from './dispatch.service'
import { DISPATCH_LOCATION_TYPES, CreateDispatchReferralDto } from './dto/create-dispatch-referral.dto'
import { FindDispatchByCoordinatesDto } from './dto/find-dispatch-by-coordinates.dto'
import type {
  DispatchCandidatesApi,
  DispatchCandidatesByCoordinatesApi,
  DispatchReferralApi,
} from './dispatch.types'

/**
 * The dispatcher's screen — admin only, and that is the whole access story.
 *
 * `AdminJwtGuard` at class level, like every other `/admin/*` controller: it
 * checks the role AND the session audience, so the pre-2FA token cannot reach
 * any of this. No driver-facing route exposes any of it, and there is
 * deliberately no public variant: the ranking here names who has been given
 * work and who has not, which is nobody's business but the operator's.
 */
@UseGuards(AdminJwtGuard)
@Controller('admin/dispatch')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  /**
   * Who to offer a job in this place to.
   *
   * The place arrives as slug + name + type rather than as an id, because the
   * taxonomy is static TypeScript and there is nothing to resolve an id
   * against — the same reason the referral body carries it (see the DTO).
   * Query parameters are validated here by hand rather than by a DTO: a GET's
   * query is not covered by the global `ValidationPipe`'s body handling, and
   * two `includes` are clearer than a class for three strings.
   */
  @Get('candidates')
  listCandidates(
    @Query('slug') slug: string,
    @Query('name') name: string,
    @Query('type') type: string,
    @Query('filter') filter?: string,
    @Query('regionCities') regionCities?: string,
    @Query('regionZones') regionZones?: string,
  ): Promise<DispatchCandidatesApi> {
    const locationType = DISPATCH_LOCATION_TYPES.includes(type as DispatchLocationType)
      ? (type as DispatchLocationType)
      : 'city'
    const chosen = DISPATCH_FILTERS.includes(filter as DispatchFilter)
      ? (filter as DispatchFilter)
      : 'all'

    return this.dispatch.listCandidates(
      {
        slug: slug ?? '',
        name: name ?? '',
        type: locationType,
        regionCitySlugs: slugList(regionCities),
        regionZoneSlugs: slugList(regionZones),
      },
      chosen,
    )
  }

  /**
   * Who is closest to a point the dispatcher typed in or read off a map —
   * "search by coordinates", alongside `candidates`'s "search by place".
   *
   * A POST body, not a GET query, for the same reason `nearest-tow-trucks` is
   * one: see `FindDispatchByCoordinatesDto`. `200`, not `201`: nothing is
   * created here either.
   */
  @Post('candidates-by-coordinates')
  @HttpCode(HttpStatus.OK)
  listCandidatesByCoordinates(
    @Body() dto: FindDispatchByCoordinatesDto,
  ): Promise<DispatchCandidatesByCoordinatesApi> {
    return this.dispatch.listCandidatesByCoordinates(dto.latitude, dto.longitude, dto.filter ?? 'all')
  }

  /**
   * «Ուղղորդված է» — the job was given to this driver.
   *
   * The admin's own id comes from the token (`AdminJwtGuard` puts it on the
   * request), never from the body: who dispatched is a fact about the session,
   * and the one field in this whole feature that a caller must not be able to
   * choose.
   */
  @Post('referrals')
  record(
    @Body() dto: CreateDispatchReferralDto,
    @Req() request: AuthenticatedAdminRequest,
  ): Promise<DispatchReferralApi> {
    return this.dispatch.recordReferral(dto, request.adminUserId as number)
  }
}

/**
 * A comma-separated slug list from the query string.
 *
 * Same wire format and same reason as `regionCities` on `ListTowTrucksQuery`:
 * the marz's own towns and corridors, sent because this backend has no
 * geography to expand a marz with. Parsed here rather than by a DTO for the
 * reason the controller already gives about its other query parameters — a
 * GET's query is not covered by the global ValidationPipe's body handling.
 *
 * Empty and absent are the same thing, and only ever produce a narrower
 * result: a marz with no expansion still matches drivers based in it.
 */
function slugList(value?: string): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean)
}
