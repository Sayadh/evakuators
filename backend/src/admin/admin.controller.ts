import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common'
import { RegistrationStatus } from '@prisma/client'
import type { RegistrationWithImages } from '../registration/registration.repository'
import type { ReviewWithTruck } from '../reviews/reviews.repository'
import { AdminService } from './admin.service'
import { ApproveRegistrationDto } from './dto/approve-registration.dto'

/**
 * Moderation endpoints. Authentication is intentionally not implemented yet —
 * in production this controller must sit behind the future auth guard
 * (see the User model in Prisma, which is already prepared for it).
 */
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
  ): Promise<{ towTruckId: number }> {
    return this.adminService.approve(id, dto)
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
