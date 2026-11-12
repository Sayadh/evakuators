-- App-registered drivers are NOT on the website until they ask to be (2026-11-12).
--
-- "appOnly" marks a TowTruck that is hidden from the site because its driver
-- signed up in the app and has not been published, as opposed to one an admin
-- deactivated (isActive = false, deactivationReason set). Live dispatch never
-- reads it: app access is FleetDriver.status, not TowTruck.isActive.
ALTER TABLE "TowTruck" ADD COLUMN "appOnly" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "SiteListingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- The driver's "I want to be on the website too", reviewed by an admin.
CREATE TABLE "SiteListingRequest" (
  "id"               SERIAL PRIMARY KEY,
  "towTruckId"       INTEGER NOT NULL REFERENCES "TowTruck"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "status"           "SiteListingStatus" NOT NULL DEFAULT 'PENDING',
  "note"             TEXT,
  "rejectionReason"  TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt"       TIMESTAMP(3),
  "reviewedByUserId" INTEGER,
  CONSTRAINT "SiteListingRequest_rejection_check" CHECK ("status" <> 'REJECTED' OR "rejectionReason" IS NOT NULL)
);

CREATE INDEX "SiteListingRequest_towTruckId_idx" ON "SiteListingRequest"("towTruckId");
CREATE INDEX "SiteListingRequest_status_createdAt_idx" ON "SiteListingRequest"("status", "createdAt");
-- At most one open request per truck
CREATE UNIQUE INDEX "SiteListingRequest_one_pending" ON "SiteListingRequest"("towTruckId") WHERE "status" = 'PENDING';
