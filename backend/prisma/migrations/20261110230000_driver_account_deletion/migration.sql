-- A driver can delete his own app account from inside the app (App Store
-- guideline 5.1.1(v), Google Play account-deletion policy) — 2026-11.
--
-- The FleetDriver row is NOT removed: every foreign key to it cascades, so a
-- hard delete would also erase the assignments and offers of orders he
-- carried out — records the business must keep. Instead the row becomes
-- status DELETED and, for APP_ONLY, every personal field is cleared (phone,
-- password, name, vehicle description, base location). Sessions, push tokens,
-- presence and all location data are deleted by the application in the same
-- transaction (fleet-access.ts `deleteOwnAccount`).
--
-- The shape check is re-created so a DELETED app-only row may hold NULLs.
-- It compares "status"::text, not the enum: a value added by ALTER TYPE in
-- this same transaction may not be used as an enum literal yet.

ALTER TYPE "FleetDriverStatus" ADD VALUE IF NOT EXISTS 'DELETED';

ALTER TABLE "FleetDriver" DROP CONSTRAINT "FleetDriver_shape_check";
ALTER TABLE "FleetDriver" ADD CONSTRAINT "FleetDriver_shape_check" CHECK (
  ("kind" = 'SITE_LINKED' AND "towTruckId" IS NOT NULL
     AND "phone" IS NULL AND "passwordHash" IS NULL AND "driverName" IS NULL
     AND "vehicleType" IS NULL AND "capacityTons" IS NULL AND "maxLoadTons" IS NULL
     AND "manipulator" IS NULL AND "wheelSkates" IS NULL AND "vehicleDescription" IS NULL
     AND "status"::text <> 'PENDING_REVIEW' AND "status"::text <> 'REJECTED')
  OR
  ("kind" = 'APP_ONLY' AND "towTruckId" IS NULL AND "status"::text <> 'DELETED'
     AND "phone" IS NOT NULL AND "passwordHash" IS NOT NULL AND "driverName" IS NOT NULL
     AND "vehicleType" IS NOT NULL AND "capacityTons" IS NOT NULL
     AND "manipulator" IS NOT NULL AND "wheelSkates" IS NOT NULL)
  OR
  ("kind" = 'APP_ONLY' AND "towTruckId" IS NULL AND "status"::text = 'DELETED'
     AND "phone" IS NULL AND "passwordHash" IS NULL AND "driverName" IS NULL
     AND "vehicleDescription" IS NULL AND "baseLatitude" IS NULL AND "baseLongitude" IS NULL)
);
