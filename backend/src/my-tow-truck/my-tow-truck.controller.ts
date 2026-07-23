import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common'
import { AuthenticatedDriverRequest, DriverJwtGuard } from '../driver-auth/driver-jwt.guard'
import type { TowTruckApi } from '../tow-trucks/tow-truck.types'
import { UpdateMyTowTruckDto } from './dto/update-my-tow-truck.dto'
import { MyTowTruckService } from './my-tow-truck.service'

/** Driver self-service — every route here only ever touches the caller's own profile */
@Controller('my/tow-truck')
@UseGuards(DriverJwtGuard)
export class MyTowTruckController {
  constructor(private readonly myTowTruckService: MyTowTruckService) {}

  @Get()
  getMine(@Req() request: AuthenticatedDriverRequest): Promise<TowTruckApi> {
    return this.myTowTruckService.getMine(request.towTruckId)
  }

  @Patch()
  updateMine(
    @Req() request: AuthenticatedDriverRequest,
    @Body() dto: UpdateMyTowTruckDto,
  ): Promise<TowTruckApi> {
    return this.myTowTruckService.updateMine(request.towTruckId, dto)
  }
}
