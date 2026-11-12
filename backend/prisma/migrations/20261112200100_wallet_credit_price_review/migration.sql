-- Driver wallet, second round (product decisions 2026-11-12). Additive only.
--
-- 1. A per-driver CREDIT LIMIT, set by an operator for drivers he trusts: the
--    driver keeps getting orders until his balance reaches −creditLimitAmd
--    (e.g. at night, when topping up is not possible). 0 = none (default).
--    "lowNotifiedAt": when the «your balance is running low» push was last
--    sent — one push per dip, not one per order.
ALTER TABLE "DriverWallet"
  ADD COLUMN "creditLimitAmd" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lowNotifiedAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT "DriverWallet_creditLimit_check" CHECK ("creditLimitAmd" >= 0);

-- 2. The sign rule learns the bonus line (always money in).
ALTER TABLE "WalletEntry" DROP CONSTRAINT "WalletEntry_sign_check";
ALTER TABLE "WalletEntry"
  ADD CONSTRAINT "WalletEntry_sign_check" CHECK (
    ("kind" IN ('TOPUP', 'TOPUP_BONUS', 'ORDER_FEE_REFUND', 'ADMIN_CREDIT') AND "amountAmd" > 0)
    OR ("kind" IN ('ORDER_FEE', 'ADMIN_DEBIT') AND "amountAmd" < 0)
    OR "kind" = 'ORDER_FEE_ADJUSTMENT'
  );
-- A bonus belongs to the top-up it came with; one per payment.
ALTER TABLE "WalletEntry" DROP CONSTRAINT "WalletEntry_payment_kind_check";
ALTER TABLE "WalletEntry"
  ADD CONSTRAINT "WalletEntry_payment_kind_check" CHECK ("paymentId" IS NULL OR "kind" IN ('TOPUP', 'TOPUP_BONUS'));
DROP INDEX "WalletEntry_paymentId_key";
CREATE UNIQUE INDEX "WalletEntry_paymentId_kind_key" ON "WalletEntry" ("paymentId", "kind") WHERE "paymentId" IS NOT NULL;

-- 3. Price review. A driver who enters the MINIMUM price (the free band) for a
--    negotiated order does not get the provisional fee back automatically: an
--    operator calls the customer first. APPROVED → the fee is returned;
--    CORRECTED → the operator entered the real price and the fee follows it.
CREATE TABLE "OrderPriceReview" (
  "id"                SERIAL NOT NULL,
  "orderId"           INTEGER NOT NULL,
  "assignmentId"      INTEGER NOT NULL,
  "driverId"          INTEGER NOT NULL,
  "priceAmd"          INTEGER NOT NULL,
  "status"            TEXT NOT NULL DEFAULT 'PENDING',
  "correctedPriceAmd" INTEGER,
  "note"              TEXT,
  "createdAt"         TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "resolvedAt"        TIMESTAMPTZ(3),
  "resolvedByUserId"  INTEGER,
  CONSTRAINT "OrderPriceReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderPriceReview_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "DispatchOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderPriceReview_assignmentId_fkey" FOREIGN KEY ("assignmentId")
    REFERENCES "OrderAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderPriceReview_driverId_fkey" FOREIGN KEY ("driverId")
    REFERENCES "FleetDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderPriceReview_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'CORRECTED')),
  CONSTRAINT "OrderPriceReview_resolution_check" CHECK (
    ("status" = 'PENDING' AND "resolvedAt" IS NULL)
    OR ("status" = 'APPROVED' AND "resolvedAt" IS NOT NULL)
    OR ("status" = 'CORRECTED' AND "resolvedAt" IS NOT NULL AND "correctedPriceAmd" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "OrderPriceReview_one_pending_per_order" ON "OrderPriceReview" ("orderId") WHERE "status" = 'PENDING';
CREATE INDEX "OrderPriceReview_pending_idx" ON "OrderPriceReview" ("createdAt") WHERE "status" = 'PENDING';
CREATE INDEX "OrderPriceReview_driver_idx" ON "OrderPriceReview" ("driverId", "createdAt" DESC);
