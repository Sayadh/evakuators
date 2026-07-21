import { Transform } from 'class-transformer'
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class ListTowTrucksQuery {
  @IsOptional()
  @IsString()
  city?: string

  @IsOptional()
  @IsString()
  district?: string

  @IsOptional()
  @IsString()
  region?: string

  /** Comma-separated city slugs of the region (static data lives in the frontend) */
  @IsOptional()
  @Transform(({ value }: { value: string }) =>
    value
      .split(',')
      .map((slug) => slug.trim())
      .filter(Boolean),
  )
  @IsString({ each: true })
  regionCities?: string[]

  @IsOptional()
  @IsBoolean()
  yerevan?: boolean

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}
