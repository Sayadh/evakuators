-- capacityRange becomes required (backfill any existing NULLs first so the
-- NOT NULL constraint doesn't fail on old rows)
UPDATE "RegistrationRequest" SET "capacityRange" = '' WHERE "capacityRange" IS NULL;
ALTER TABLE "RegistrationRequest" ALTER COLUMN "capacityRange" SET NOT NULL;

-- works24Hours is no longer its own column on RegistrationRequest — it's just
-- one of the `services` slugs now (see backend/src/tow-trucks/service-slugs.ts).
-- TowTruck.works24Hours is untouched: it stays as a derived boolean used for
-- sorting/filtering the public listing.
ALTER TABLE "RegistrationRequest" DROP COLUMN "works24Hours";
