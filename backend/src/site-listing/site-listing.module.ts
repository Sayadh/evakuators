import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { TelegramModule } from '../telegram/telegram.module'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { SiteListingAdminController } from './site-listing.controller'
import { SiteListingService } from './site-listing.service'

/** App-only driver → published website profile (see SiteListingService) */
@Module({
  imports: [TelegramModule, AdminAuthModule, TowTrucksModule],
  controllers: [SiteListingAdminController],
  providers: [SiteListingService],
  exports: [SiteListingService],
})
export class SiteListingModule {}
