import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { UserRole } from '@prisma/client'
import type { Request } from 'express'

export interface AuthenticatedAdminRequest extends Request {
  adminUserId: number
}

/**
 * Protects every /admin route at the application layer — this is the real
 * authentication boundary now, not nginx Basic Auth (which only ever gated
 * the transport and broke cross-origin fetch() calls, see git history).
 * Keep nginx TLS/rate-limiting in front by all means, just don't rely on it
 * as the only thing standing between the public internet and moderation data.
 */
@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedAdminRequest>()
    const header = request.headers.authorization

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token')
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: number; role: UserRole }>(
        header.slice('Bearer '.length),
        { secret: this.config.getOrThrow<string>('adminJwtSecret') },
      )
      if (payload.role !== UserRole.ADMIN) throw new Error('not an admin')
      request.adminUserId = payload.sub
      return true
    } catch {
      throw new UnauthorizedException('Invalid or expired token')
    }
  }
}
