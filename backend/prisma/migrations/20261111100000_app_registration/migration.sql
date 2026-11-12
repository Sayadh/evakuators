-- The driver app's sign-up now files an ordinary website registration request
-- (product decision, 2026-11): the same form, photos, moderation and public
-- profile as evakuators.am/register. Additive only.
--
-- "source"             WEB (default — every existing row) or APP.
-- "passwordHash"       the password chosen in the app; moved onto
--                      "TowTruck"."passwordHash" at approval and cleared here.
-- "approvedTowTruckId" the truck approval created — the app grants itself
--                      access on the driver's first sign-in from it.
CREATE TYPE "RegistrationSource" AS ENUM ('WEB', 'APP');

ALTER TABLE "RegistrationRequest"
  ADD COLUMN "source" "RegistrationSource" NOT NULL DEFAULT 'WEB',
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "approvedTowTruckId" INTEGER;

-- A password only ever comes with an app sign-up.
ALTER TABLE "RegistrationRequest"
  ADD CONSTRAINT "RegistrationRequest_password_source_check" CHECK ("passwordHash" IS NULL OR "source" = 'APP');

CREATE INDEX "RegistrationRequest_phone_idx" ON "RegistrationRequest"("phone");
CREATE INDEX "RegistrationRequest_approvedTowTruckId_idx" ON "RegistrationRequest"("approvedTowTruckId");
