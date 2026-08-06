import { Body, Controller, Get, HttpCode, Patch, Req, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { SetCoordinatesDto } from '../common/set-coordinates.dto'
import { DriverAuthService } from '../driver-auth/driver-auth.service'
import { ChangePasswordDto } from '../driver-auth/dto/change-password.dto'
import { AuthenticatedDriverRequest, DriverJwtGuard } from '../driver-auth/driver-jwt.guard'
import type { TowTruckApi } from '../tow-trucks/tow-truck.types'
import { UpdateMyTowTruckDto } from './dto/update-my-tow-truck.dto'
import { MyTowTruckService } from './my-tow-truck.service'

/** Driver self-service — every route here only ever touches the caller's own profile */
@Controller('my/tow-truck')
@UseGuards(DriverJwtGuard)
export class MyTowTruckController {
  constructor(
    private readonly myTowTruckService: MyTowTruckService,
    private readonly driverAuthService: DriverAuthService,
  ) {}

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

  /**
   * Replaces the caller's own password. Lives on this controller, not on
   * `/driver-auth`, because it is an authenticated action on the caller's own
   * profile — the truck id comes from the JWT exactly like every other route
   * here, so there is no id in the body for anyone to point elsewhere.
   *
   * Throttled below the global default even though the guard already requires
   * a valid session: `currentPassword` is verified here, so an unthrottled
   * route would let a stolen token be used to guess the password it did not
   * come with (see ChangePasswordDto for why that check exists at all).
   *
   * Answers 204, not the profile. Nothing about the truck changed, and echoing
   * the profile back would suggest the response is worth reading.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Patch('password')
  @HttpCode(204)
  changePassword(
    @Req() request: AuthenticatedDriverRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.driverAuthService.changePassword(
      request.towTruckId,
      dto.currentPassword,
      dto.newPassword,
    )
  }
}
