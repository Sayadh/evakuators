import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { SiteSettingsController } from './site-settings.controller'
import { SiteSettingsService } from './site-settings.service'

/** Site-wide settings switched from /admin (2026-11-18) — see site-settings.service.ts */
@Module({
  imports: [AdminAuthModule],
  controllers: [SiteSettingsController],
  providers: [SiteSettingsService],
})
export class SiteSettingsModule {}
