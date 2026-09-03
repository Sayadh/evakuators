import { Body, Controller, Delete, Get, HttpCode, Patch, Req, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { SetCoordinatesDto } from '../common/set-coordinates.dto'
import { DriverAuthService } from '../driver-auth/driver-auth.service'
import { ChangePasswordDto } from '../driver-auth/dto/change-password.dto'
import { AuthenticatedDriverRequest, DriverJwtGuard } from '../driver-auth/driver-jwt.guard'
import { ProfileChangesService } from '../profile-changes/profile-changes.service'
import { SubscriptionActiveGuard } from '../subscriptions/subscription-active.guard'
import type { DriverProfileChangeStatusApi } from '../profile-changes/profile-change.types'
import { toDriverProfileChangeStatus } from '../profile-changes/profile-change.mapper'
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
    private readonly profileChanges: ProfileChangesService,
  ) {}

  @Get()
  getMine(@Req() request: AuthenticatedDriverRequest): Promise<TowTruckApi> {
    return this.myTowTruckService.getMine(request.towTruckId)
  }

  /**
   * Submits the profile form **for review**. It does not write.
   *
   * This used to save straight to the live listing. Every field a driver can
   * change is now moderated, so what this does is queue a diff — see
   * `ProfileChangesService`. The response says what is now waiting rather than
   * echoing a profile that has not changed, which is also why it is no longer
   * `TowTruckApi`: returning the old profile after a "successful" save is how a
   * dashboard ends up telling a driver their edit went through.
   *
   * `pending: null` means nothing differed. The form submits every field
   * whether or not it was touched, so opening it and pressing save is a normal
   * way to reach that, and it is not an error.
   */
  // Guarded: editing the public profile is the thing the subscription pays
  // for. Reads below stay open — see SubscriptionActiveGuard.
  @UseGuards(SubscriptionActiveGuard)
  @Patch()
  async updateMine(
    @Req() request: AuthenticatedDriverRequest,
    @Body() dto: UpdateMyTowTruckDto,
  ): Promise<DriverProfileChangeStatusApi> {
    const pending = await this.profileChanges.submitProfileChange(request.towTruckId, dto)
    return toDriverProfileChangeStatus({ pending, lastReviewed: null })
  }

  /** What is queued for this driver, or why the last attempt was refused */
  @Get('profile-change')
  async getProfileChange(
    @Req() request: AuthenticatedDriverRequest,
  ): Promise<DriverProfileChangeStatusApi> {
    const status = await this.profileChanges.getStatusForDriver(request.towTruckId)
    return toDriverProfileChangeStatus(status)
  }

  /**
   * Withdraws the queued edit. Nothing was ever applied, so it is simply
   * deleted rather than marked cancelled — a withdrawn edit is not a decision
   * anyone needs a record of, and keeping it would occupy the one pending slot.
   */
  @Delete('profile-change')
  withdrawProfileChange(
    @Req() request: AuthenticatedDriverRequest,
  ): Promise<{ withdrawn: boolean }> {
    return this.profileChanges.withdraw(request.towTruckId)
  }

  /**
   * Base parking coordinates, saved on their own.
   *
   * Its own route rather than two more keys on the PATCH above, because the
   * dashboard edits it in a dialog with its own Save button — see
   * MyTowTruckService.applyCoordinates for the full argument. The truck id
   * comes from the JWT like every other route here, so a driver cannot even
   * express a request to move someone else's marker.
   *
   * Moderated like everything else: this queues, it does not write. A base
   * location is as public a claim as a service area, and leaving it as the one
   * self-service field would make it the obvious way around the review.
   */
  @UseGuards(SubscriptionActiveGuard)
  @Patch('coordinates')
  async updateCoordinates(
    @Req() request: AuthenticatedDriverRequest,
    @Body() dto: SetCoordinatesDto,
  ): Promise<DriverProfileChangeStatusApi> {
    const pending = await this.profileChanges.submitCoordinatesChange(request.towTruckId, dto)
    return toDriverProfileChangeStatus({ pending, lastReviewed: null })
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
