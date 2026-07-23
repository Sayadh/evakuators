import { IsBoolean } from 'class-validator'

export class SetTowTruckActiveDto {
  @IsBoolean()
  isActive!: boolean
}
