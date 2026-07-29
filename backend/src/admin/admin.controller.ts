import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { RegistrationStatus } from '@prisma/client'
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard'
import type { RegistrationWithImages } from '../registration/registration.repository'
import type { ReviewWithTruck } from '../reviews/reviews.repository'
import type { AdminTowTruckSummary } from './admin-tow-truck.mapper'
import { AdminService } from './admin.service'
import { AdminListQuery, AdminRegistrationsQuery } from './dto/admin-list.query'
import { ApproveRegistrationDto } from './dto/approve-registration.dto'
import { SetTowTruckActiveDto } from './dto/set-tow-truck-active.dto'
import { SetTowTruckFeaturedDto } from './dto/set-tow-truck-featured.dto'
import { SetTowTruckPhoneDto } from './dto/set-tow-truck-phone.dto'

/** Moderation endpoints — every route requires a valid admin JWT (see AdminAuthModule) */
@UseGuards(AdminJwtGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('registration-requests')
  list(@Query() query: AdminRegistrationsQuery): Promise<RegistrationWithImages[]> {
    return this.adminService.listRegistrations(query)
  }

  @Post('registration-requests/:id/approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveRegistrationDto,
  ): Promise<{ towTruckId: number; telegramLinkUrl: string }> {
    return this.adminService.approve(id, dto)
  }

  /** (Re)generate the Telegram-login link for an existing tow truck (e.g. if the first one expired) */
  @Post('tow-trucks/:id/telegram-link')
  regenerateTelegramLink(@Param('id', ParseIntPipe) id: number): Promise<{ telegramLinkUrl: string }> {
    return this.adminService
      .generateTelegramLink(id)
      .then((telegramLinkUrl) => ({ telegramLinkUrl }))
  }

  @Post('registration-requests/:id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ id: number; status: RegistrationStatus }> {
    return this.adminService.reject(id)
  }

  @Get('reviews')
  listReviews(@Query() query: AdminListQuery): Promise<ReviewWithTruck[]> {
    return this.adminService.listPendingReviews(query)
  }

  @Post('reviews/:id/approve')
  approveReview(@Param('id', ParseIntPipe) id: number): Promise<{ id: number; isApproved: boolean }> {
    return this.adminService.approveReview(id)
  }

  @Post('reviews/:id/reject')
  rejectReview(@Param('id', ParseIntPipe) id: number): Promise<{ id: number }> {
    return this.adminService.rejectReview(id)
  }

  /** Every tow truck, active or not — paginated, unlike the public listing */
  @Get('tow-trucks')
  listTowTrucks(@Query() query: AdminListQuery): Promise<AdminTowTruckSummary[]> {
    return this.adminService.listTowTrucks(query)
  }

  /** Deactivate/reactivate — non-destructive, reversible, hides from public listing */
  @Patch('tow-trucks/:id/active')
  setActive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetTowTruckActiveDto,
  ): Promise<{ id: number; isActive: boolean }> {
    return this.adminService.setTowTruckActive(id, dto.isActive)
  }

  /** Toggle the homepage "best tow trucks" pick — purely editorial */
  @Patch('tow-trucks/:id/featured')
  setFeatured(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetTowTruckFeaturedDto,
  ): Promise<{ id: number; isFeatured: boolean }> {
    return this.adminService.setTowTruckFeatured(id, dto.isFeatured)
  }

  /**
   * Corrects the main login phone — the driver's own dashboard can't touch
   * this field (see MyTowTruckService), so a typo made at registration would
   * otherwise be permanent. Rejects a value already used by another active
   * truck — see AdminService.setTowTruckPhone.
   */
  @Patch('tow-trucks/:id/phone')
  setPhone(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetTowTruckPhoneDto,
  ): Promise<{ id: number; phone: string }> {
    return this.adminService.setTowTruckPhone(id, dto.phone)
  }

  /** Permanently deletes the tow truck + its images/reviews/OTPs. Irreversible. */
  @Delete('tow-trucks/:id')
  deleteTowTruck(@Param('id', ParseIntPipe) id: number): Promise<{ id: number }> {
    return this.adminService.deleteTowTruck(id)
  }
}
