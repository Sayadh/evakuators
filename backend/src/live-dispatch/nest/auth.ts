/**
 * Guards for the live-dispatch endpoints.
 *
 * - `DriverAppGuard`: the APP token only (`aud: driver:app`, carries `sid`).
 *   The device session must exist, belong to the token's driver and not be
 *   revoked — checked on EVERY request, which is what makes logout, device
 *   replacement and admin revocation immediate. The driver id comes from the
 *   token, never from a body. The 30-day WEB token (no audience) is refused.
 * - `OpsGuard`: an admin-panel session token with role ADMIN or DISPATCHER.
 *   Same secret and audience check as `AdminJwtGuard` (which stays ADMIN-only
 *   for every pre-existing route).
 * - `AdminOnly` (decorator) narrows an ops route to ADMIN — dispatch settings.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { ADMIN_SESSION_AUDIENCE } from '../../admin-auth/admin-token.audience'
import { LiveDispatchRuntimeHolder } from './runtime.provider'

export const DRIVER_APP_AUDIENCE = 'driver:app'

export interface DriverAppRequest extends Request {
  driverId: number
  sessionId: string
}

export type OpsRole = 'ADMIN' | 'DISPATCHER'

export interface OpsRequest extends Request {
  adminUserId: number
  opsRole: OpsRole
}

const ADMIN_ONLY = 'liveDispatch:adminOnly'
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true)

function bearer(request: Request): string {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Մուտք գործեք համակարգ շարունակելու համար')
  return header.slice('Bearer '.length)
}

/** Verifies an app token and its live device session; shared by HTTP and WebSocket */
export async function verifyDriverAppToken(
  jwt: JwtService,
  secret: string,
  holder: LiveDispatchRuntimeHolder,
  token: string,
): Promise<{ driverId: number; sessionId: string }> {
  let payload: { sub: number; sid: string }
  try {
    payload = await jwt.verifyAsync<{ sub: number; sid: string }>(token, { secret, audience: DRIVER_APP_AUDIENCE })
  } catch {
    throw new UnauthorizedException('Ձեր մուտքի ժամկետը սպառվել է, խնդրում ենք նորից մուտք գործել')
  }
  const session = await holder.runtime.fleet.findSession(String(payload.sid))
  if (!session || session.revokedAt || session.driverId !== payload.sub) {
    throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Այս սարքի նստաշրջանն ավարտված է, մուտք գործեք կրկին' })
  }
  return { driverId: payload.sub, sessionId: session.id }
}

export async function verifyOpsToken(jwt: JwtService, secret: string, token: string): Promise<{ adminUserId: number; role: OpsRole }> {
  try {
    const payload = await jwt.verifyAsync<{ sub: number; role: string }>(token, { secret, audience: ADMIN_SESSION_AUDIENCE })
    if (payload.role !== 'ADMIN' && payload.role !== 'DISPATCHER') throw new Error('role')
    return { adminUserId: payload.sub, role: payload.role }
  } catch {
    throw new UnauthorizedException('Ձեր admin նստաշրջանի ժամկետը սպառվել է, մուտք գործեք կրկին')
  }
}

@Injectable()
export class DriverAppGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly holder: LiveDispatchRuntimeHolder,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DriverAppRequest>()
    const identity = await verifyDriverAppToken(this.jwt, this.config.getOrThrow<string>('driverJwtSecret'), this.holder, bearer(request))
    request.driverId = identity.driverId
    request.sessionId = identity.sessionId
    void this.holder.runtime.fleet.touchSession(identity.sessionId).catch(() => undefined)
    return true
  }
}

@Injectable()
export class OpsGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OpsRequest>()
    const identity = await verifyOpsToken(this.jwt, this.config.getOrThrow<string>('adminJwtSecret'), bearer(request))
    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, [context.getHandler(), context.getClass()])
    if (adminOnly && identity.role !== 'ADMIN') throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Միայն ադմինիստրատորի համար' })
    request.adminUserId = identity.adminUserId
    request.opsRole = identity.role
    return true
  }
}
