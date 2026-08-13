import { IsString, MaxLength, MinLength } from 'class-validator'

/**
 * Why a queued profile edit was refused.
 *
 * Required, not optional, and with a floor on the length. The driver is shown
 * this verbatim — in Telegram and on their dashboard — and it is the only thing
 * that tells them which of their changes was the problem. An empty or one-word
 * refusal («ոչ») leaves them to guess, and the likeliest next move is to submit
 * the same edit again, which costs a second review for the same reason.
 *
 * 10 characters is low enough not to obstruct a real short answer
 * («Նկարը մշուշոտ է») and high enough to rule out a keystroke.
 */
export class RejectProfileChangeDto {
  @IsString()
  @MinLength(10, { message: 'Գրեք մերժման պատճառը (առնվազն 10 նիշ)' })
  @MaxLength(500)
  reason!: string
}
