import { IsBoolean } from 'class-validator'

/**
 * Admin-only. There is deliberately no driver-facing counterpart to this DTO —
 * see `derivesHeavyEquipment` in `backend/src/tow-trucks/vehicle-types.ts` for
 * why this one judgement is not the driver's to make.
 */
export class SetTowTruckHeavyEquipmentDto {
  @IsBoolean()
  heavyEquipment!: boolean
}
