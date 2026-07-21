import { Module } from '@nestjs/common'
import { RegistrationModule } from '../registration/registration.module'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'

@Module({
  imports: [RegistrationModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
