import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { UserRole } from '@prisma/client'
import type { Request } from 'express'
import { ADMIN_SESSION_AUDIENCE } from './admin-token.audience'

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
import { PrismaService } from '../prisma/prisma.service'
import { adminSessionStillValid } from './admin-session-check'

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedAdminRequest>()
    const header = request.headers.authorization

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Մուտք գործեք admin հաշվով շարունակելու համար')
    }

    let payload: { sub: number; role: UserRole }
    try {
      payload = await this.jwt.verifyAsync<{ sub: number; role: UserRole }>(
        header.slice('Bearer '.length),
        {
          secret: this.config.getOrThrow<string>('adminJwtSecret'),
          // Without this, the 5-minute 2FA token — signed with the same secret,
          // and issued BEFORE the second factor has been proven — would be
          // accepted here as a full session. That is the entire second factor
          // bypassed by sending the right token to the wrong endpoint. The
          // mirror of this check is in AdminAuthService.verifyCode().
          audience: ADMIN_SESSION_AUDIENCE,
        },
      )
    } catch {
      throw new UnauthorizedException('Ձեր admin նստաշրջանի ժամկետը սպառվել է, մուտք գործեք կրկին')
    }
    // A VALID session of another role (DISPATCHER, live dispatch console
    // only) is 403, not 401: the session is fine, this route is not theirs.
    // A 401 here would make the frontend's apiFetch log them out of the
    // console they are allowed to use.
    // A deleted admin, or one whose role changed, is out at once (not in 24 h)
    if (!(await adminSessionStillValid(this.prisma, payload.sub, payload.role))) {
      throw new UnauthorizedException('Ձեր admin նստաշրջանի ժամկետը սպառվել է, մուտք գործեք կրկին')
    }
    if (payload.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Այս բաժինը հասանելի է միայն ադմինիստրատորին')
    }
    request.adminUserId = payload.sub
    return true
  }
}
