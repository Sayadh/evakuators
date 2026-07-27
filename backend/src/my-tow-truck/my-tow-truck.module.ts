import { Module } from '@nestjs/common'
import { DriverAuthModule } from '../driver-auth/driver-auth.module'
import { ImagesModule } from '../images/images.module'
import { StorageModule } from '../storage/storage.module'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { MyTowTruckController } from './my-tow-truck.controller'
import { MyTowTruckService } from './my-tow-truck.service'

@Module({
  imports: [TowTrucksModule, DriverAuthModule, ImagesModule, StorageModule],
  controllers: [MyTowTruckController],
  providers: [MyTowTruckService],
})
export class MyTowTruckModule {}
