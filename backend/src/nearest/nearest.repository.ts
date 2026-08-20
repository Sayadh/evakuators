import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { SPECIALIST_VEHICLE_TYPES } from '../tow-trucks/vehicle-types'
import type { NearestCandidateRow } from './nearest.types'

/**
 * The one place PostGIS is touched.
 *
 * Raw SQL rather than Prisma's query API because Prisma has no geography type
 * (see the `location` field in schema.prisma) and therefore no way to express
 * either the KNN ordering or `ST_DWithin`. Everything else about the tow truck —
 * the card columns, the ratings — is still read through the normal typed path;
 * this query deliberately returns nothing but ids and distances so the two
 * halves cannot drift into showing different data for the same driver.
 */
@Injectable()
export class NearestRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The N nearest published drivers to a point, by straight-line distance.
   *
   * ## Why ids and distances only
   *
   * Selecting the card columns here would mean maintaining a second copy of
   * `CARD_SELECT` in raw SQL, which is exactly how a listing ends up showing a
   * field the public listing withholds. Instead this answers "who and how far",
   * and `NearestService` fetches the actual cards through
   * `TowTrucksRepository`, the same way every other listing does.
   *
   * ## Specialist trucks are filtered HERE, not afterwards
   *
   * «Մանիպուլյատոր» and «Ծանր տեխնիկա» are landing-page-only
   * (`SPECIALIST_VEHICLE_TYPES`), and someone pressing "find the nearest
   * evacuator" next to a broken car is the clearest case of general discovery
   * there is. The clause sits inside this query for the same reason `isActive`
   * does: dropping them from the result afterwards would silently return fewer
   * than N drivers — and on this page N is small and the visitor is stranded.
   *
   * It also keeps the KNN walk honest. `LIMIT` stops the index scan, so a
   * post-filter would be choosing from "the 25 nearest trucks of any kind"
   * rather than "the 25 nearest trucks a visitor can actually call".
   *
   * ## The filters are the publication rule, restated
   *
   * `isActive` is the only publication flag this system has: a `TowTruck` row
   * exists only because an admin approved a registration, and `isActive: false`
   * is what hides one again. Both halves are enforced here rather than left to a
   * later filter, because a search that fetched deactivated drivers and dropped
   * them afterwards would silently return fewer than N results.
   *
   * `location IS NOT NULL` excludes every driver approved before coordinates
   * existed. It is not strictly needed — the operators below never match NULL —
   * but stating it is what lets the partial GiST index be used.
   *
   * ## `<->` and ST_DWithin together, not either alone
   *
   * `ORDER BY location <-> point` is the KNN operator: with a GiST index Postgres
   * walks the index in distance order and stops at LIMIT, instead of computing
   * every driver's distance and sorting. `ST_DWithin` bounds that walk so a point
   * with no drivers anywhere near it cannot drag the scan across the country.
   * ST_Distance in the SELECT is then just reporting the number for the rows that
   * survived — it is not what does the ordering.
   */
  async findNearestCandidates(
    latitude: number,
    longitude: number,
    radiusMeters: number,
    limit: number,
  ): Promise<NearestCandidateRow[]> {
    // ST_MakePoint takes X then Y — longitude first. The same order as the
    // generated column in the migration, and the same bug if reversed: every
    // distance comes back plausible and every one is wrong.
    const rows = await this.prisma.$queryRaw<
      { id: number; straightLineMeters: number; latitude: Prisma.Decimal; longitude: Prisma.Decimal }[]
    >`
      WITH origin AS (
        SELECT ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography AS point
      )
      SELECT
        t."id",
        ST_Distance(t."location", o.point) AS "straightLineMeters",
        t."latitude",
        t."longitude"
      FROM "TowTruck" t, origin o
      WHERE t."isActive" = true
        AND t."vehicleType" NOT IN (${Prisma.join([...SPECIALIST_VEHICLE_TYPES])})
        AND t."location" IS NOT NULL
        AND ST_DWithin(t."location", o.point, ${radiusMeters}::double precision)
      ORDER BY t."location" <-> o.point
      LIMIT ${limit}::int
    `

    return rows.map((row) => ({
      id: row.id,
      // $queryRaw hands back whatever the driver produced: a double precision
      // column arrives as a JS number, but the two DECIMAL columns arrive as
      // Prisma.Decimal objects whose toJSON() is a string. Normalised here so
      // nothing downstream has to know which is which — same reasoning as
      // decimalToNumber() in common/coordinates.ts.
      straightLineMeters: Number(row.straightLineMeters),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
    }))
  }
}
