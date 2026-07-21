import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'

export class CreateReviewDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  authorName!: string

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  text!: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cityName?: string
}
