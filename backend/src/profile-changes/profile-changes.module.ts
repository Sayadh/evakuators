import { Module, forwardRef } from '@nestjs/common'
import { MyTowTruckModule } from '../my-tow-truck/my-tow-truck.module'
import { TelegramModule } from '../telegram/telegram.module'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { ProfileChangesRepository } from './profile-changes.repository'
import { ProfileChangesService } from './profile-changes.service'

/**
 * No controller of its own, deliberately.
 *
 * The two audiences for a queued edit already have a controller each, and both
 * are guarded differently: a driver reaches their own request through
 * `MyTowTruckController` (driver JWT, truck id from the token), a moderator
 * through `AdminController` (admin JWT). A third controller would have to
 * re-derive one of those boundaries.
 *
 * `forwardRef` on MyTowTruckModule because the dependency is genuinely mutual:
 * this service applies an approved edit through `MyTowTruckService`, and that
 * module's controller queues one through this service.
 */
@Module({
  imports: [forwardRef(() => MyTowTruckModule), TowTrucksModule, TelegramModule],
  providers: [ProfileChangesRepository, ProfileChangesService],
  exports: [ProfileChangesService],
})
export class ProfileChangesModule {}
