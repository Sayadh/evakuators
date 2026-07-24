import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'

export class CreateReviewDto {
  @IsString()
  @MinLength(2, { message: 'Մուտքագրեք Ձեր անունը' })
  @MaxLength(80)
  authorName!: string

  @IsInt()
  @Min(1, { message: 'Գնահատականը պետք է լինի 1-ից 5' })
  @Max(5, { message: 'Գնահատականը պետք է լինի 1-ից 5' })
  rating!: number

  @IsString()
  @MinLength(5, { message: 'Կարծիքի տեքստը շատ կարճ է' })
  @MaxLength(2000)
  text!: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cityName?: string
}
