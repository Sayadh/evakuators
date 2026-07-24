import { IsEmail, IsString, Matches } from 'class-validator'

export class VerifyAdminCodeDto {
  @IsEmail()
  email!: string

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Կոդը պետք է լինի ուղիղ 6 թվանշան' })
  code!: string
}
