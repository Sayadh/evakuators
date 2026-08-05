import { IsLatitudeValue, IsLongitudeValue } from './coordinates'

/**
 * The body of both coordinate-setting endpoints:
 * `PATCH /my/tow-truck/coordinates` (driver, own profile) and
 * `PATCH /admin/tow-trucks/:id/coordinates` (admin, any profile).
 *
 * ## One DTO, two audiences — deliberately
 *
 * The two endpoints differ in *whose* truck they touch and nothing else; the
 * value being written is the same value, subject to the same rule. Giving each
 * its own class would let the two drift into accepting different things, which
 * is precisely the failure `common/phone.ts` exists to prevent for the phone
 * column. Same argument as `AnalyticsDashboardService` being shared by the
 * driver and admin analytics controllers (see docs/analytics.md).
 *
 * ## Why exactly two fields, both required
 *
 * This is the whole mass-assignment defence, and it is structural rather than
 * a check: with `forbidNonWhitelisted` on globally (main.ts), a request that
 * mentions any other column — `isActive`, `phone`, `slug` — is a 400 before it
 * reaches a service, and there is no code path from these endpoints to any
 * other column even if it were not.
 *
 * Both required, not optional: half a coordinate is not a location, and the
 * pair is written together or not at all. A driver who wants to *remove* their
 * coordinates has no button for that on purpose — the value only ever gets
 * corrected, never blanked, so there is no "clear" case to model.
 */
export class SetCoordinatesDto {
  @IsLatitudeValue()
  latitude!: number

  @IsLongitudeValue()
  longitude!: number
}
