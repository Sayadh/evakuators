import { Module } from '@nestjs/common'
import { DriverAuthModule } from '../driver-auth/driver-auth.module'
import { ImagesModule } from '../images/images.module'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { MyTowTruckController } from './my-tow-truck.controller'
import { MyTowTruckService } from './my-tow-truck.service'

// No StorageModule: this module no longer touches Supabase Storage directly —
// ImagesService's nightly purge is the single owner of object deletion.
@Module({
  imports: [TowTrucksModule, DriverAuthModule, ImagesModule],
  controllers: [MyTowTruckController],
  providers: [MyTowTruckService],
})
export class MyTowTruckModule {}
