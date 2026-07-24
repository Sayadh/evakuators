import { IsString, MaxLength, MinLength } from 'class-validator'

export class RequestCodeDto {
  @IsString()
  @MinLength(8, { message: 'Մուտքագրեք վավեր հեռախոսահամար' })
  @MaxLength(20, { message: 'Մուտքագրեք վավեր հեռախոսահամար' })
  phone!: string
}
