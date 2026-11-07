-- PostGIS columns for live dispatch — kept in their own migration so the
-- non-spatial schema can be proved on a Postgres without PostGIS (the
-- integration test environment), exactly as `migrations.pglite.spec.ts` does
-- for the original nearest-search migration.
--
-- Same three decisions as `TowTruck.location` (docs/nearest-search.md § PostGIS):
-- GENERATED from latitude/longitude (cannot drift), geography (metres, no
-- projection), partial GiST index. And the same trap: Prisma cannot express a
-- generated column, so `prisma migrate dev` must never be run (docs/data-model.md).
--
-- ST_MakePoint takes X then Y — LONGITUDE FIRST.

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE "DriverLocationCurrent"
  ADD COLUMN "location" geography(Point, 4326)
  GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)::geography
  ) STORED;

CREATE INDEX "DriverLocationCurrent_location_gist"
  ON "DriverLocationCurrent" USING GIST ("location");

ALTER TABLE "DispatchOrder"
  ADD COLUMN "pickupLocation" geography(Point, 4326)
  GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint("pickupLongitude"::double precision, "pickupLatitude"::double precision), 4326)::geography
  ) STORED;
