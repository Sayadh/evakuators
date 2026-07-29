import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator'
import { RegistrationStatus } from '@prisma/client'
import {
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_MAX_LIMIT,
} from '../../tow-trucks/tow-trucks.constants'

/**
 * `?limit=&offset=` for the admin listings.
 *
 * These are the tables that genuinely grow without bound: registration requests
 * are kept forever as an audit trail (nothing ever deletes them), and the tow
 * truck list only ever gets longer. They were returning every row on every page
 * load, so an admin panel that was instant in year one would get slower every
 * month until it timed out.
 *
 * Unlike the public listing, there is no client-side filtering here to break —
 * the status filter is already a server-side query param — so real offset
 * pagination is safe and the panel just grows a "load more" button.
 */
export class AdminListQuery {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(ADMIN_LIST_MAX_LIMIT)
  limit: number = ADMIN_LIST_DEFAULT_LIMIT

  @IsOptional()
  @IsInt()
  @Min(0)
  offset: number = 0
}

/** The registration list additionally filters by moderation status */
export class AdminRegistrationsQuery extends AdminListQuery {
  @IsOptional()
  @IsEnum(RegistrationStatus)
  status?: RegistrationStatus
}
