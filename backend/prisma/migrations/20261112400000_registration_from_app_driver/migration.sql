-- «Հրապարակել կայքում» for an app-only driver (2026-11-12): the admin turns
-- what the driver entered in the app into a website registration, completes it
-- on the review page and approves; approval then moves that same app account
-- onto the new TowTruck (same id, same password, same order history).
ALTER TABLE "RegistrationRequest" ADD COLUMN "fleetDriverId" INTEGER;
CREATE INDEX "RegistrationRequest_fleetDriverId_idx" ON "RegistrationRequest"("fleetDriverId");
