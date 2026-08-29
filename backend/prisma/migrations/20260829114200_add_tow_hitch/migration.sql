-- AlterTable: a tow hitch — the truck can pull a second car in tow at the
-- same time it carries one on the platform. Same driver-answered
-- equipment-boolean shape as doubleDeck (see the schema comment on
-- TowTruck.towHitch for why it is its own column, not derived from it).
--
-- Additive and non-destructive: a NOT NULL column with a DEFAULT, so every
-- existing row answers `false` without a backfill — nobody has been asked
-- the question yet, and "not stated" and "no" are the same thing for a
-- capability a driver opts into.
ALTER TABLE "TowTruck" ADD COLUMN IF NOT EXISTS "towHitch" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RegistrationRequest" ADD COLUMN IF NOT EXISTS "towHitch" BOOLEAN NOT NULL DEFAULT false;
