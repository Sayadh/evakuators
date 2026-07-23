import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AdminAuthController } from './admin-auth.controller'
import { AdminAuthService } from './admin-auth.service'
import { AdminJwtGuard } from './admin-jwt.guard'
import { AdminUserRepository } from './admin-user.repository'

@Module({
  imports: [JwtModule.register({})],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminUserRepository, AdminJwtGuard],
  exports: [AdminJwtGuard, JwtModule],
})
export class AdminAuthModule {}
