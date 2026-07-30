import { IsArmenianPhone } from '../../common/phone'

/**
 * The pattern itself now lives in `common/phone.ts`. It used to be defined
 * here, which made this — the admin-only correction endpoint — the only place
 * in the backend that enforced the canonical phone shape, while registration
 * and both driver-auth endpoints accepted any 8-20 character string.
 */
export class SetTowTruckPhoneDto {
  @IsArmenianPhone()
  phone!: string
}
