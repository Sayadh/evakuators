import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common'
import { SiteListingStatus } from '@prisma/client'
import { AdminJwtGuard, type AuthenticatedAdminRequest } from '../admin-auth/admin-jwt.guard'
import { SiteListingService } from './site-listing.service'

/** The moderation side of "I want to be on the website too" */
@UseGuards(AdminJwtGuard)
@Controller('admin/site-listing-requests')
export class SiteListingAdminController {
  constructor(private readonly siteListing: SiteListingService) {}

  @Get()
  list(@Query('status') status?: string) {
    const parsed = status && (Object.values(SiteListingStatus) as string[]).includes(status) ? (status as SiteListingStatus) : undefined
    return this.siteListing.adminList(status === 'ALL' ? undefined : (parsed ?? SiteListingStatus.PENDING))
  }

  @Get('count')
  async count() {
    return { pending: await this.siteListing.adminPendingCount() }
  }

  /** «Հրապարակել կայքում» for an app-only driver → a registration request to complete and approve */
  @Post('from-app-driver/:driverId')
  fromAppDriver(@Param('driverId', ParseIntPipe) driverId: number) {
    return this.siteListing.registrationFromAppDriver(driverId)
  }

  /** Publishes an app driver's hidden profile at once */
  @Post('publish/:towTruckId')
  @HttpCode(204)
  publish(@Param('towTruckId', ParseIntPipe) towTruckId: number, @Req() req: AuthenticatedAdminRequest) {
    return this.siteListing.adminPublishTruck(towTruckId, req.adminUserId)
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.siteListing.adminDetail(id)
  }

  @Post(':id/approve')
  @HttpCode(204)
  approve(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedAdminRequest) {
    return this.siteListing.adminApprove(id, req.adminUserId)
  }

  @Post(':id/reject')
  @HttpCode(204)
  reject(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedAdminRequest, @Body() body: { reason?: unknown }) {
    return this.siteListing.adminReject(id, req.adminUserId, body?.reason)
  }
}
