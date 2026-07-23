import { Module } from '@nestjs/common'
import { DriverAuthModule } from '../driver-auth/driver-auth.module'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { MyTowTruckController } from './my-tow-truck.controller'
import { MyTowTruckService } from './my-tow-truck.service'

@Module({
  imports: [TowTrucksModule, DriverAuthModule],
  controllers: [MyTowTruckController],
  providers: [MyTowTruckService],
})
export class MyTowTruckModule {}
