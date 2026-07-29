import { Matches } from 'class-validator'

/** Same exact shape the frontend locks every phone input to — see armenianPhoneInputValue() */
export const ARMENIAN_PHONE_PATTERN = /^\+374\d{8}$/

export class SetTowTruckPhoneDto {
  @Matches(ARMENIAN_PHONE_PATTERN, {
    message: 'Հեռախոսահամարը պետք է լինի այս ձևաչափով՝ +37491000001',
  })
  phone!: string
}
