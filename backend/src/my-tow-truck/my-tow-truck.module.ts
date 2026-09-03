import { Module, forwardRef } from '@nestjs/common'
import { DriverAuthModule } from '../driver-auth/driver-auth.module'
import { ImagesModule } from '../images/images.module'
import { ProfileChangesModule } from '../profile-changes/profile-changes.module'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { MyTowTruckController } from './my-tow-truck.controller'
import { MyTowTruckService } from './my-tow-truck.service'
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'

// No StorageModule: this module no longer touches Supabase Storage directly —
// ImagesService's nightly purge is the single owner of object deletion.
@Module({
  // forwardRef: the driver's controller queues an edit through
  // ProfileChangesService, and that service applies an approved one back
  // through MyTowTruckService — a genuine cycle, declared rather than broken by
  // duplicating the write.
  imports: [TowTrucksModule, DriverAuthModule, ImagesModule, forwardRef(() => ProfileChangesModule), SubscriptionsModule],
  controllers: [MyTowTruckController],
  providers: [MyTowTruckService],
  exports: [MyTowTruckService],
})
export class MyTowTruckModule {}
