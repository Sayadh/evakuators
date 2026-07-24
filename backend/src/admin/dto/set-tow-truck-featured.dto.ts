import { IsBoolean } from 'class-validator'

export class SetTowTruckFeaturedDto {
  @IsBoolean()
  isFeatured!: boolean
}
