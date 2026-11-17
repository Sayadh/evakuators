-- How sure the operator is of the pickup coordinates (2026-11-17): EXACT
-- (confirmed with the customer — a shared location, a known address) or
-- APPROXIMATE (a guess from a landmark or a street). The driver sees it under
-- «Նավիգացիա» and on the offer, so an approximate point means «call the
-- customer for the exact spot».
--
-- Required by the API whenever coordinates are written (order-input.ts);
-- NULL means no coordinates, or an order created before this column — shown
-- as nothing rather than guessed. Additive only, no backfill.
ALTER TABLE "DispatchOrder" ADD COLUMN "pickupPrecision" TEXT;
ALTER TABLE "DispatchOrder" ADD CONSTRAINT "DispatchOrder_pickupPrecision_check"
  CHECK ("pickupPrecision" IS NULL OR "pickupPrecision" IN ('EXACT', 'APPROXIMATE'));
