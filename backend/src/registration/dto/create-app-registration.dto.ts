import { IsString, MaxLength, MinLength } from 'class-validator'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../driver-auth/driver-password'
import { CreateRegistrationDto } from './create-registration.dto'

/**
 * The driver app's sign-up: the website's registration, plus a password.
 *
 * Extends `CreateRegistrationDto` rather than restating it, so the app can
 * never ask for a different profile than `/register` does — one class, the
 * same rule `RegistrationProfileDto` already holds for the admin review page.
 * The mobile form imports the website's own form state and validators for the
 * same reason (mobile/metro.config.js § "~/").
 *
 * ## Why this form chooses a password and the website's does not
 *
 * A website driver's password is minted when they tap their Telegram link
 * (docs/auth-and-security.md § "Where a driver's password comes from"). A
 * driver who signed up IN the app has to be able to sign in to the app once
 * approved, without a Telegram detour, so the password is chosen here. It is
 * worth exactly as much as the moderation behind it: an admin calls the number
 * before approving (there is no SMS check), which is the same assurance the
 * app-only accounts had. At approval the hash moves onto `TowTruck` with
 * `mustChangePassword: false` — the third row of the handover table, where a
 * later Telegram link "touches nothing, sends nothing".
 */
export class CreateAppRegistrationDto extends CreateRegistrationDto {
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Գաղտնաբառը պետք է լինի առնվազն ${PASSWORD_MIN_LENGTH} նիշ` })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string
}
