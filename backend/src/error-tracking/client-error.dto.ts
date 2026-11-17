import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator'

/** One error from the admin pages or the driver app (POST /errors/client) */
export class ClientErrorDto {
  @IsIn(['admin', 'mobile'])
  source!: 'admin' | 'mobile'

  @IsString()
  @MaxLength(1000)
  message!: string

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  stack?: string

  /** The page or screen, e.g. /admin/orders/6 or «ActiveOrder» */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  where?: string

  /** App or site version */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  release?: string

  /** Small free-form details (device, OS); capped server-side */
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>
}
