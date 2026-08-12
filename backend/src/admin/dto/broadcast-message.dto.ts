import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator'

/**
 * `TELEGRAM_MESSAGE_MAX_LENGTH` here MUST match the constant of the same name
 * in `frontend/constants/admin.ts` — see CLAUDE.md § "Manual sync points".
 * Telegram's own hard limit on `sendMessage` text is 4096 UTF-16 code units;
 * this stays comfortably under it rather than pinned to the exact number, so a
 * driver's name or a footer this project might prepend later never pushes a
 * message that validated clean over Telegram's real ceiling.
 */
export const TELEGRAM_MESSAGE_MAX_LENGTH = 4000

export class BroadcastMessageDto {
  /**
   * The exact text sent, verbatim — no template, no per-driver substitution.
   * Plain `sendMessage` with no button, unlike every other message this bot
   * sends: those all exist to make a specific action easy (tap to log in, tap
   * to link), and an admin-authored announcement has no single action to
   * attach one to.
   */
  @IsString()
  @IsNotEmpty({ message: 'Հաղորդագրությունը չի կարող դատարկ լինել' })
  @MaxLength(TELEGRAM_MESSAGE_MAX_LENGTH, {
    message: `Հաղորդագրությունը չպետք է գերազանցի ${TELEGRAM_MESSAGE_MAX_LENGTH} նիշը`,
  })
  message!: string

  /**
   * Exactly whom to send to. Required and non-empty — same rule and same
   * reasoning as `IssuePasswordsDto.towTruckIds`: there is no "omit this to
   * mean everyone" shorthand, because a Telegram message cannot be unsent and
   * staging's database is a copy of production's, real chat ids and all. The
   * service intersects this with the live candidate list before acting, so an
   * id that is no longer eligible (deactivated since the panel loaded,
   * Telegram unlinked) is skipped rather than trusted.
   */
  @IsArray()
  @ArrayNotEmpty({ message: 'Ընտրեք առնվազն մեկ վարորդ' })
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  towTruckIds!: number[]
}
