import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsInt } from 'class-validator'

export class IssuePasswordsDto {
  /**
   * Exactly whose passwords to issue. Required and non-empty — there is no
   * "omit this to mean everyone" shorthand, deliberately: a Telegram message
   * cannot be unsent, so the one request shape this endpoint accepts is one
   * that names its recipients.
   *
   * The service intersects this with the real candidate list before acting, so
   * an id that is not a genuine candidate (already has a password, no Telegram
   * linked, does not exist) is skipped rather than trusted — the array says who
   * an admin *wants* to send to, never who is *eligible*.
   *
   * `ArrayUnique` because a repeated id would otherwise issue two passwords in
   * a row and send two messages, the second invalidating the first.
   * `ArrayMaxSize` bounds one request to a plausible driver count; it is a
   * sanity limit on a loop that makes one Telegram call per element, not a
   * business rule.
   */
  @IsArray()
  @ArrayNotEmpty({ message: 'Ընտրեք առնվազն մեկ վարորդ' })
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  towTruckIds!: number[]
}
