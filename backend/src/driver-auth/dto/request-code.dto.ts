import { IsString, MaxLength, MinLength } from 'class-validator'

export class RequestCodeDto {
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  phone!: string
}
