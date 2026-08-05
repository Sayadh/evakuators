-- PostGIS support for the "nearest evacuator" search.
--
-- Requires the extension's package to be installed on the host first, e.g.
--   apt install postgresql-16-postgis-3        (match your server's major version)
-- and this statement must run as a superuser. `prisma migrate deploy` connects
-- as the DATABASE_URL role, so on a database whose role is not a superuser this
-- one line has to be run by hand once, as postgres:
--   sudo -u postgres psql -d <db> -c 'CREATE EXTENSION IF NOT EXISTS postgis;'
-- IF NOT EXISTS makes doing it either way safe and repeatable.
CREATE EXTENSION IF NOT EXISTS postgis;

-- AlterTable
-- A generated column, not a third thing to keep in sync by hand.
--
-- `latitude`/`longitude` stay the source of truth: they are what the driver
-- enters, what the API validates and what every form reads back. This column is
-- purely their spatial projection, recomputed by Postgres itself on every write,
-- so it is structurally impossible for the point to disagree with the numbers —
-- which is exactly the failure mode a separately-maintained geometry column has.
--
-- STORED (PostgreSQL has no VIRTUAL generated columns yet) and therefore
-- indexable, which is the whole reason it exists.
--
-- Argument order is (longitude, latitude): ST_MakePoint takes X then Y, and X is
-- longitude. Reversing it is the classic PostGIS bug — every distance comes back
-- plausible and every one of them is wrong — so it is spelled out here rather
-- than left to be re-derived by the next reader.
--
-- ::geography, not geometry: distances then come back in METRES on the WGS84
-- spheroid, with no projection step and no degrees-to-kilometres fudge factor.
-- Slightly slower than a projected geometry, and irrelevant at this data volume.
--
-- NULL for every driver without coordinates, which is what keeps them out of the
-- search without a single extra WHERE clause.
ALTER TABLE "TowTruck"
  ADD COLUMN "location" geography(Point, 4326)
  GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography
  ) STORED;

-- CreateIndex
-- GiST, not b-tree: the query is a KNN ordering (`location <-> $point`) plus a
-- radius filter (`ST_DWithin`), and neither can use a b-tree at all. With this
-- index the nearest-N lookup is an Index Scan that stops after N rows instead of
-- computing the distance to every driver in the country and sorting the lot.
--
-- Partial, on the rows that can actually match: a driver with no coordinates has
-- a NULL location and can never be a search result, so indexing them would only
-- add write cost. Today that is most of the table.
CREATE INDEX "TowTruck_location_gist"
  ON "TowTruck"
  USING GIST ("location")
  WHERE "location" IS NOT NULL;
