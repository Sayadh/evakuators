import { IsString, MaxLength, MinLength } from 'class-validator'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../driver-password'

export class ChangePasswordDto {
  /**
   * Proof that whoever is holding this session also knows the password, not
   * just a token lifted from a shared phone. Required even when the current
   * password is the temporary one we generated — the driver is reading it off
   * Telegram at that moment anyway, and dropping the check for that one case
   * would mean a stolen 30-day token could take over the account outright.
   */
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Գաղտնաբառը պետք է լինի առնվազն ${PASSWORD_MIN_LENGTH} նիշ`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword!: string
}
