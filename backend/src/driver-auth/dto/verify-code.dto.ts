import { IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class VerifyCodeDto {
  @IsString()
  @MinLength(8, { message: 'Մուտքագրեք վավեր հեռախոսահամար' })
  @MaxLength(20, { message: 'Մուտքագրեք վավեր հեռախոսահամար' })
  phone!: string

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Կոդը պետք է լինի ուղիղ 6 թվանշան' })
  code!: string
}
