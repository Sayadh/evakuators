import { IsString, MaxLength } from 'class-validator'
import { IsArmenianPhone } from '../../common/phone'
import { PASSWORD_MAX_LENGTH } from '../driver-password'

export class DriverLoginDto {
  /**
   * The lookup key. Looked up against `TowTruck.phone` with an exact string
   * comparison, so anything non-canonical could never match a stored row
   * regardless — see `common/phone.ts`.
   */
  @IsArmenianPhone()
  phone!: string

  /**
   * No `@MinLength` here, on purpose. A minimum on the LOGIN form tells an
   * attacker where to stop guessing, and it would reject a short password that
   * some earlier version of the rules might have allowed — locking out a real
   * driver to enforce a rule the credential predates. The maximum stays,
   * because it is not a policy: it is the point past which bcrypt stops
   * reading (see PASSWORD_MAX_LENGTH). The strength rule belongs on
   * ChangePasswordDto, where a password is actually chosen.
   */
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string
}
