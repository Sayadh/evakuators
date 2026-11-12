-- Base (parking) location as a dispatch FALLBACK (product decision, 2026-11).
--
-- When no driver with a FRESH GPS fix is found anywhere in the search radii,
-- dispatch may offer the order to an online driver whose app is connected
-- (fresh heartbeat) but whose GPS is stale or missing, measuring distance from
-- his base instead. It is never used for anything a customer sees ("online
-- now near you" stays GPS-only) and never ahead of a driver with real GPS.
--
-- Where the base comes from:
--   SITE_LINKED → "TowTruck"."latitude"/"longitude" (the website profile's
--                 base parking, already entered at website registration);
--   APP_ONLY    → the new "FleetDriver"."baseLatitude"/"baseLongitude",
--                 optional at app sign-up.
--
-- Additive only: nullable columns, a defaulted column, and the view re-created
-- with the same columns in the same order plus two appended at the end.

ALTER TABLE "FleetDriver"
  ADD COLUMN "baseLatitude"  DECIMAL(9, 6),
  ADD COLUMN "baseLongitude" DECIMAL(9, 6),
  ADD CONSTRAINT "FleetDriver_base_pair_check" CHECK (("baseLatitude" IS NULL) = ("baseLongitude" IS NULL)),
  ADD CONSTRAINT "FleetDriver_base_range_check" CHECK (
    "baseLatitude" IS NULL OR ("baseLatitude" BETWEEN -90 AND 90 AND "baseLongitude" BETWEEN -180 AND 180)
  );

-- Which position a candidate was found by: its live GPS fix, or its base.
-- The offer-time re-check uses the matching eligibility rule.
ALTER TABLE "DispatchCandidate"
  ADD COLUMN "locationSource" TEXT NOT NULL DEFAULT 'GPS',
  ADD CONSTRAINT "DispatchCandidate_locationSource_check" CHECK ("locationSource" IN ('GPS', 'BASE'));

CREATE OR REPLACE VIEW "FleetDriverProfile" AS
SELECT
  d."id",
  d."kind",
  d."status",
  d."towTruckId",
  (d."status" = 'ACTIVE') AS "isActive",
  (d."kind" = 'SITE_LINKED' AND tt."isActive" IS TRUE) AS "siteListed",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."driverName"   ELSE d."driverName"   END AS "driverName",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."phone"        ELSE d."phone"        END AS "phone",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."vehicleType"  ELSE d."vehicleType"  END AS "vehicleType",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."capacityTons" ELSE d."capacityTons" END AS "capacityTons",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."maxLoadTons"  ELSE d."maxLoadTons"  END AS "maxLoadTons",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."manipulator"  ELSE d."manipulator"  END AS "manipulator",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."wheelSkates"  ELSE d."wheelSkates"  END AS "wheelSkates",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."slug"         ELSE NULL             END AS "slug",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."latitude"     ELSE d."baseLatitude"  END AS "baseLatitude",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."longitude"    ELSE d."baseLongitude" END AS "baseLongitude"
FROM "FleetDriver" d
LEFT JOIN "TowTruck" tt ON tt."id" = d."towTruckId";
