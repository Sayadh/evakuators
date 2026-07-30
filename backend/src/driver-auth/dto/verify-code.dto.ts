import { IsString, Matches } from 'class-validator'
import { IsArmenianPhone } from '../../common/phone'

export class VerifyCodeDto {
  /** Same lookup key as RequestCodeDto — see `common/phone.ts` */
  @IsArmenianPhone()
  phone!: string

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Կոդը պետք է լինի ուղիղ 6 թվանշան' })
  code!: string
}
