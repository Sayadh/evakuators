import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common'
import { RegistrationStatus } from '@prisma/client'
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard'
import type { RegistrationWithImages } from '../registration/registration.repository'
import type { ReviewWithTruck } from '../reviews/reviews.repository'
import { AdminService } from './admin.service'
import { ApproveRegistrationDto } from './dto/approve-registration.dto'

/** Moderation endpoints — every route requires a valid admin JWT (see AdminAuthModule) */
@UseGuards(AdminJwtGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('registration-requests')
  list(@Query('status') status?: RegistrationStatus): Promise<RegistrationWithImages[]> {
    return this.adminService.listRegistrations(status)
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
  listReviews(): Promise<ReviewWithTruck[]> {
    return this.adminService.listPendingReviews()
  }

  @Post('reviews/:id/approve')
  approveReview(@Param('id', ParseIntPipe) id: number): Promise<{ id: number; isApproved: boolean }> {
    return this.adminService.approveReview(id)
  }

  @Post('reviews/:id/reject')
  rejectReview(@Param('id', ParseIntPipe) id: number): Promise<{ id: number }> {
    return this.adminService.rejectReview(id)
  }
}
