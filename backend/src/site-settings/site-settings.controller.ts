import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common'
import { IsIn } from 'class-validator'
import { AdminJwtGuard, type AuthenticatedAdminRequest } from '../admin-auth/admin-jwt.guard'
import { SiteSettingsService, type PublicSiteSettings, type SiteDesign } from './site-settings.service'

export class UpdateSiteDesignDto {
  @IsIn([1, 2])
  design!: SiteDesign
}

@Controller()
export class SiteSettingsController {
  constructor(private readonly settings: SiteSettingsService) {}

  /** Public: every page's SSR reads it (cached a few seconds server-side) */
  @Get('site-settings')
  get(): Promise<PublicSiteSettings> {
    return this.settings.get()
  }

  /** ADMIN only: switch the site design (2026-11-18) */
  @UseGuards(AdminJwtGuard)
  @Put('admin/site-settings/design')
  setDesign(@Req() req: AuthenticatedAdminRequest, @Body() dto: UpdateSiteDesignDto): Promise<PublicSiteSettings> {
    return this.settings.setDesign(dto.design, req.adminUserId)
  }
}
