import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt } from 'class-validator'
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
 * never ask for different things. The only field that belongs to this endpoint
 * alone is the photo set: a moderator reviewing the request neither uploads nor
 * replaces photos, so it would be meaningless on the approval payload.
 */
export class CreateRegistrationDto extends RegistrationProfileDto {
  /** Ids returned by POST /images (main image first) */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  imageIds!: number[]
}
