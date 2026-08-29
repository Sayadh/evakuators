import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
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

/**
 * The tow truck list additionally filters by vehicle type.
 *
 * Plain string, not an enum — same reasoning as `RegistrationProfileDto`'s own
 * `vehicleType`: the backend stores it as an opaque slug and the taxonomy
 * itself is owned by `frontend/constants/vehicles.ts` (see vehicle-types.ts).
 * Deliberately plain equality on the raw column, unlike the public listing's
 * `?vehicleType=manipulator`/`heavy-duty` union (see
 * `TowTrucksRepository.buildWhere`) — the admin panel shows each truck's own
 * `vehicleType` label on its card, so a filter that pulled in trucks by a
 * *different* union field (the `manipulator`/`heavyEquipment` checkboxes)
 * would show cards under a filter whose own label disagrees with it.
 */
export class AdminTowTrucksQuery extends AdminListQuery {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleType?: string

  /**
   * Base-location filters — plain equality on the truck's own
   * regionSlug/citySlug/districtSlug columns, unlike the public listing's
   * `region`/`city`/`district` (see `TowTrucksRepository.buildWhere`), which
   * additionally matches *coverage* (serviceAreas) and widens for
   * marz-wide/uncapped specialists. Here the question is only ever "where is
   * this driver based", so there is no OR, no corridor fallback and no
   * specialist exemption to reason about — see
   * `TowTrucksRepository.findAllForAdmin`.
   *
   * Cascades the way the geography select does everywhere else on the site:
   * `regionSlug` alone is every driver based anywhere in that marz;
   * `regionSlug` + `citySlug` narrows to one town in it. Composable but
   * normally sent together — the admin panel's own filter always sends
   * `citySlug` alongside the `regionSlug` it belongs to.
   */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  regionSlug?: string

  @IsOptional()
  @IsString()
  @MaxLength(60)
  citySlug?: string

  /**
   * Yerevan's districts stand in for cities there — same column, same
   * meaning as everywhere else in the schema (see TowTruck.districtSlug).
   * Mutually exclusive with `regionSlug`/`citySlug` in practice: a truck
   * carries one or the other, never both, and the filter UI only ever sends
   * one branch.
   */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  districtSlug?: string

  /**
   * "Every Yerevan-based driver, no specific district chosen" — the one case
   * `districtSlug` alone cannot express, since there is no shared value to
   * match against. Mirrors `ListTowTrucksQuery.yerevan` on the public
   * listing for exactly the same reason: Yerevan is a pseudo-region with no
   * `regionSlug` of its own (see CLAUDE.md), so "just Yerevan" needs its own
   * flag rather than a slug.
   */
  @IsOptional()
  @IsBoolean()
  yerevan?: boolean
}

/**
 * `?search=` for `/admin/tow-trucks/payments` — matched server-side against
 * driver name, company name and phone (see `TowTrucksRepository.findAllForPayments`).
 * Deliberately not `AdminListQuery`-based: that page is unpaginated on
 * purpose (see the endpoint's own comment) precisely so a search never has
 * to reason about which page a match landed on — the whole table is always
 * in scope, search included.
 */
export class AdminPaymentsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string
}
