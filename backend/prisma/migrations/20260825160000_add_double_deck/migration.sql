-- AlterTable: two-tier platform (carries two cars at once) — the same
-- driver-answered equipment-boolean shape as winch/manipulator/wheelSkates.
--
-- Additive and non-destructive: a NOT NULL column with a DEFAULT, so every
-- existing row answers `false` without a backfill, which is the correct
-- answer — nobody has been asked the question yet, and "not stated" and "no"
-- are the same thing for a capability a driver opts into.
ALTER TABLE "TowTruck" ADD COLUMN IF NOT EXISTS "doubleDeck" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RegistrationRequest" ADD COLUMN IF NOT EXISTS "doubleDeck" BOOLEAN NOT NULL DEFAULT false;
