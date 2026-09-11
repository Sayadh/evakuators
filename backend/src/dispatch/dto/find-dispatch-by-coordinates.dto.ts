import { IsIn, IsOptional } from 'class-validator'
import { IsLatitudeValue, IsLongitudeValue } from '../../common/coordinates'
import { DISPATCH_FILTERS, type DispatchFilter } from '../dispatch-ranking'

/**
 * The point the dispatcher typed or read off a map, plus the same optional
 * filter the place-based search takes.
 *
 * Coordinates validated with the same two decorators every other
 * coordinate-accepting DTO uses (`common/coordinates.ts`), so this endpoint
 * accepts and rejects exactly what every write path already does.
 *
 * A POST body for the same reason `FindNearestDto` is one: a GET would put
 * the exact point in nginx's `access.log`. There is less privacy stake here —
 * these are dispatcher-entered coordinates, not a visitor's own position — but
 * there is no reason to treat this endpoint differently from the other two
 * that carry coordinates.
 */
export class FindDispatchByCoordinatesDto {
  @IsLatitudeValue()
  latitude!: number

  @IsLongitudeValue()
  longitude!: number

  @IsOptional()
  @IsIn(DISPATCH_FILTERS, { message: 'Անհայտ զտիչ' })
  filter?: DispatchFilter
}
