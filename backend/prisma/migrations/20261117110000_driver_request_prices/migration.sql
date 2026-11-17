-- «Գինը չհամաձայնեցվեց» (2026-11-17): a driver who backs out over the price
-- says what he asked (required for that reason, order-input.ts) and, if he
-- knows, what the customer offered — so the operator knows what price the
-- next driver has to meet. NULL for every other request.
--
-- Additive only: two nullable columns, no backfill.
ALTER TABLE "OrderDriverRequest" ADD COLUMN "driverPriceAmd" INTEGER;
ALTER TABLE "OrderDriverRequest" ADD COLUMN "customerPriceAmd" INTEGER;
ALTER TABLE "OrderDriverRequest" ADD CONSTRAINT "OrderDriverRequest_prices_check"
  CHECK (("driverPriceAmd" IS NULL OR "driverPriceAmd" >= 0) AND ("customerPriceAmd" IS NULL OR "customerPriceAmd" >= 0));
