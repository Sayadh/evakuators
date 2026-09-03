import { DeactivationReason } from '@prisma/client'
import { IsBoolean, IsIn, ValidateIf } from 'class-validator'

/**
 * `reason` is required exactly when deactivating, and ignored when
 * reactivating — `@ValidateIf` rather than `@IsOptional` so that leaving it
 * out of a deactivation is a rejected request, not a silent null.
 *
 * That strictness is the point: the value decides whether the driver can sign
 * in again at all (see DeactivationReason in schema.prisma), so "the admin
 * forgot to say" must not quietly become "banned".
 */
export class SetTowTruckActiveDto {
  @IsBoolean()
  isActive!: boolean

  @ValidateIf((dto: SetTowTruckActiveDto) => !dto.isActive)
  @IsIn([DeactivationReason.UNPAID, DeactivationReason.OTHER], {
    message: 'Նշեք ապաակտիվացման պատճառը',
  })
  reason?: DeactivationReason
}
