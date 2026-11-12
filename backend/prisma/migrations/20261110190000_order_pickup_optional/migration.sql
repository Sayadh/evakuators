-- Product decision, 2026-11: the new-order form no longer requires pickup
-- coordinates, only the pickup address text. "latitude BETWEEN -90 AND 90"
-- style CHECK constraints already pass on NULL (unknown), so only the two
-- NOT NULL constraints need dropping. "pickupLocation" (previous migration)
-- is GENERATED from these columns and already tolerates NULL input — a NULL
-- latitude/longitude simply produces a NULL geography point.
--
-- An order with no pickup point can never enter AUTOMATIC dispatch — the
-- radius search (DispatchEngine) has nothing to search from — enforced in
-- code by assertAutoDispatchable (dispatching/offers.repository.ts), not by
-- the database. Manual assignment to a specific driver is unaffected.

ALTER TABLE "DispatchOrder"
  ALTER COLUMN "pickupLatitude" DROP NOT NULL,
  ALTER COLUMN "pickupLongitude" DROP NOT NULL;
