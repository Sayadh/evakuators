-- AlterTable
-- Base parking coordinates for the "nearest evacuator" distance calculation.
--
-- Two numeric columns, never one string: a "40.1792, 44.4991" text column
-- cannot be compared, indexed or fed to a distance formula without being
-- parsed back apart first. The single text box a driver types into lives on
-- the frontend only.
--
-- DECIMAL(9,6): six decimal places is ~0.11 m of resolution, and precision 9
-- is the widest either axis can be ("-180.000000"). An exact decimal type
-- means a coordinate reads back exactly as it was entered.
--
-- Every column here is NULLABLE with no DEFAULT, so this statement rewrites
-- no existing row and cannot fail on existing data: drivers approved before
-- this feature simply have no coordinates until someone fills them in.
-- New registrations require them at the API boundary
-- (CreateRegistrationDto), which closes the gap going forward instead of
-- backfilling guesses.
ALTER TABLE "TowTruck" ADD COLUMN "latitude" DECIMAL(9,6);
ALTER TABLE "TowTruck" ADD COLUMN "longitude" DECIMAL(9,6);

-- AlterTable
-- Distinct from "updatedAt", which moves on any profile edit and therefore
-- cannot answer "how stale is this driver's parking location".
ALTER TABLE "TowTruck" ADD COLUMN "locationUpdatedAt" TIMESTAMP(3);

-- AlterTable
-- The same two columns on the request, so AdminService.approve() copies them
-- straight across the way it already does for platformLengthM/platformWidthM.
ALTER TABLE "RegistrationRequest" ADD COLUMN "latitude" DECIMAL(9,6);
ALTER TABLE "RegistrationRequest" ADD COLUMN "longitude" DECIMAL(9,6);
