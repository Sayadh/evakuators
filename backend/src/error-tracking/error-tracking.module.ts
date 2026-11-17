import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { ErrorTrackingController } from './error-tracking.controller'
import { ErrorTrackingService } from './error-tracking.service'

/** In-house error tracking (2026-11-17) — see error-store.ts */
@Module({
  imports: [AdminAuthModule],
  controllers: [ErrorTrackingController],
  providers: [ErrorTrackingService],
  exports: [ErrorTrackingService],
})
export class ErrorTrackingModule {}
