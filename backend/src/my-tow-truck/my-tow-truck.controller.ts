import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common'
import { SetCoordinatesDto } from '../common/set-coordinates.dto'
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

  /**
   * Base parking coordinates, saved on their own.
   *
   * Its own route rather than two more keys on the PATCH above, because the
   * dashboard edits it in a dialog with its own Save button — see
   * MyTowTruckService.updateCoordinates for the full argument. The truck id
   * comes from the JWT like every other route here, so a driver cannot even
   * express a request to move someone else's marker.
   */
  @Patch('coordinates')
  updateCoordinates(
    @Req() request: AuthenticatedDriverRequest,
    @Body() dto: SetCoordinatesDto,
  ): Promise<TowTruckApi> {
    return this.myTowTruckService.updateCoordinates(request.towTruckId, dto)
  }
}
