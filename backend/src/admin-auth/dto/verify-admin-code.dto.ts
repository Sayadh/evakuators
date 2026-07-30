import { IsString, Matches, MaxLength } from 'class-validator'

export class VerifyAdminCodeDto {
  /**
   * Proof that step 1 (email + password) actually succeeded, returned by
   * `POST /admin-auth/login`.
   *
   * Replaces the previous `email` field, which identified the account but
   * proved nothing: anyone who knew an admin's address could reach this
   * endpoint, guess at the live code, and — because failed attempts used to
   * consume the OTP — reliably kill the real admin's login in the process.
   */
  @IsString()
  @MaxLength(1024)
  pendingToken!: string

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Կոդը պետք է լինի ուղիղ 6 թվանշան' })
  code!: string
}
