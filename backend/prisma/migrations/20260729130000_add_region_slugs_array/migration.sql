-- AlterTable: replace the single mainRegionSlug column with a String[] so a
-- driver can register for up to 2 marzes (see CreateRegistrationDto).
ALTER TABLE "RegistrationRequest" ADD COLUMN "regionSlugs" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: every existing row had exactly one region — wrap it in an array
-- so no PENDING/APPROVED/REJECTED request loses its original region data.
UPDATE "RegistrationRequest" SET "regionSlugs" = ARRAY["mainRegionSlug"]::TEXT[];

-- Drop the default now that every row has been backfilled — new rows must
-- always come from the application with an explicit (1-2 item) array.
ALTER TABLE "RegistrationRequest" ALTER COLUMN "regionSlugs" DROP DEFAULT;

ALTER TABLE "RegistrationRequest" DROP COLUMN "mainRegionSlug";
