import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { isSiteAudience } from './driver-site-token'
import { PrismaService } from '../prisma/prisma.service'

export interface AuthenticatedDriverRequest extends Request {
  towTruckId: number
}

/** Protects driver-only endpoints (/my/tow-truck) with the JWT from POST /driver-auth/login */
@Injectable()
export class DriverJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedDriverRequest>()
    const header = request.headers.authorization

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Մուտք գործեք համակարգ շարունակելու համար')
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: number; aud?: unknown; sv?: unknown }>(header.slice('Bearer '.length), {
        secret: this.config.getOrThrow<string>('driverJwtSecret'),
        algorithms: ['HS256'],
      })
      // An app session or a wallet pay link is signed with the same secret
      // but is NOT a website session (driver-site-token.ts).
      if (!isSiteAudience(payload.aud) || !Number.isSafeInteger(payload.sub)) throw new Error('audience')
      // Revocation (2026-11-12): a password change or reset bumps the truck's
      // session version; a token from before (or one from before versions
      // existed — no `sv`, read as 0) no longer matches.
      const truck = await this.prisma.towTruck.findUnique({ where: { id: payload.sub }, select: { sessionVersion: true } })
      const version = typeof payload.sv === 'number' ? payload.sv : 0
      if (!truck || truck.sessionVersion !== version) throw new Error('revoked')
      request.towTruckId = payload.sub
      return true
    } catch {
      throw new UnauthorizedException('Ձեր մուտքի ժամկետը սպառվել է, խնդրում ենք նորից մուտք գործել')
    }
  }
}
