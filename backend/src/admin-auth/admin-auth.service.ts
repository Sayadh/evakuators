import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import bcrypt from 'bcrypt'
import { AdminUserRepository } from './admin-user.repository'

const TOKEN_TTL = '24h'

// Used when no matching admin exists, so login() always pays the same
// bcrypt.compare() cost — otherwise "unknown email" responds measurably
// faster than "wrong password" and an attacker can enumerate valid emails.
const DUMMY_HASH = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8G8Kn8UYwUIQEEcxJp/nDdX7O/HgFa'

export interface AdminSession {
  token: string
}

@Injectable()
export class AdminAuthService {
  private readonly secret: string

  constructor(
    private readonly adminUserRepository: AdminUserRepository,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('adminJwtSecret')
  }

  async login(email: string, password: string): Promise<AdminSession> {
    const user = await this.adminUserRepository.findAdminByEmail(email)

    const isValid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
    if (!user || !isValid) {
      throw new UnauthorizedException('Սխալ email կամ գաղտնաբառ')
    }

    const token = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { secret: this.secret, expiresIn: TOKEN_TTL },
    )

    return { token }
  }
}
