import { IsArmenianPhone } from '../../common/phone'

export class RequestCodeDto {
  /**
   * Looked up against `TowTruck.phone` with an exact string comparison
   * (`TowTrucksRepository.findActiveByMainPhone`), so anything non-canonical
   * could never match a stored row regardless — it would surface as a
   * confusing "profile not found" rather than as a format error.
   * See `common/phone.ts`.
   */
  @IsArmenianPhone()
  phone!: string
}
