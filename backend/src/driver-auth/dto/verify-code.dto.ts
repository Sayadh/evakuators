import { IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class VerifyCodeDto {
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  phone!: string

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code!: string
}
