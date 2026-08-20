import { ArrayMaxSize, ArrayMinSize, Equals, IsArray, IsBoolean, IsInt, IsString, MaxLength } from 'class-validator'
import { RegistrationProfileDto } from './registration-profile.dto'

// Re-exported so the many existing importers of these three keep working, and
// so there is still exactly one definition of each. They describe the shape of
// a driver's answers, which is `RegistrationProfileDto`'s subject, not this
// class's — see that file for the reasoning behind each number.
export {
  MAX_SLUG_ARRAY_SIZE,
  TOO_MANY_MESSAGE,
  WORKING_HOURS_PATTERN,
} from './registration-profile.dto'

/**
 * What a driver submits at `POST /registration-requests`.
 *
 * Everything a person answers lives on `RegistrationProfileDto`, shared with
 * `ApproveRegistrationDto` so the public form and the admin review page can
 * never ask for different things. What belongs to this endpoint alone is the
 * photo set — a moderator reviewing the request neither uploads nor replaces
 * photos — and the privacy consent below, for the same reason inverted: the
 * driver is the only person who can give it, so it can never appear on a
 * payload a moderator submits.
 */
export class CreateRegistrationDto extends RegistrationProfileDto {
  /** Ids returned by POST /images (main image first) */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  imageIds!: number[]

  /**
   * The consent checkbox from the dialog, required — a registration cannot be
   * submitted without it.
   *
   * `@Equals(true)` rather than `@IsBoolean()`, so `false` is rejected as
   * firmly as an omission. This is the boundary, not the frontend's disabled
   * button: that one is a courtesy to the driver and is bypassed by anyone who
   * opens a terminal. Without this decorator the entire consent requirement
   * would be a suggestion.
   */
  @IsBoolean()
  @Equals(true, {
    message:
      'Հայտն ուղարկելու համար անհրաժեշտ է հաստատել տվյալների օգտագործման և հրապարակման համաձայնությունը',
  })
  privacyConsentAccepted!: boolean

  /**
   * Which policy version the driver was shown.
   *
   * Checked against the server's `PRIVACY_POLICY_VERSION` in the service, not
   * here — see `AcceptPrivacyConsentDto` for why the check wants a specific
   * "reload the page" message rather than class-validator's generic one, and
   * for why there is deliberately no `consentTextHash` field on this or any
   * other consent payload.
   */
  @IsString()
  @MaxLength(16)
  privacyPolicyVersion!: string
}
