import { Module } from '@nestjs/common'
import { DriverAuthModule } from '../driver-auth/driver-auth.module'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { FreeRoutesController } from './free-routes.controller'
import { FreeRoutesRepository } from './free-routes.repository'
import { FreeRoutesService } from './free-routes.service'
import { MyFreeRoutesController } from './my-free-routes.controller'

@Module({
  imports: [TowTrucksModule, DriverAuthModule],
  controllers: [FreeRoutesController, MyFreeRoutesController],
  providers: [FreeRoutesService, FreeRoutesRepository],
})
export class FreeRoutesModule {}
