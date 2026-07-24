import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'

export interface AuthenticatedDriverRequest extends Request {
  towTruckId: number
}

/** Protects driver-only endpoints (/my/tow-truck) with the JWT from verify-code */
@Injectable()
export class DriverJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedDriverRequest>()
    const header = request.headers.authorization

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Մուտք գործեք համակարգ շարունակելու համար')
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: number }>(header.slice('Bearer '.length), {
        secret: this.config.getOrThrow<string>('driverJwtSecret'),
      })
      request.towTruckId = payload.sub
      return true
    } catch {
      throw new UnauthorizedException('Ձեր մուտքի ժամկետը սպառվել է, խնդրում ենք նորից մուտք գործել')
    }
  }
}
