-- Driver wallet (product decision 2026-11-12).
--
-- The driver prepays a balance in drams through Idram; every order he accepts
-- in the app costs a fee from it (backend/src/live-dispatch/wallet). A driver
-- whose balance cannot cover an order's fee is not offered it — only while
-- the console setting `walletBillingEnabled` is 1 (default 0: nothing changes
-- until the business switches it on).
--
-- "DriverWallet" holds the balance; "WalletEntry" is the append-only ledger
-- that explains it (balance = SUM of entries, and every entry stores the
-- balance after it, so one row is enough to audit a statement line).
-- "WalletTopup" ties an Idram bill (a SubscriptionPayment row of kind
-- WALLET_TOPUP) to the app account it is for: the payment ledger knows tow
-- trucks, the wallet knows app drivers.
--
-- Raw-SQL tables, like the rest of live dispatch: not modelled in
-- schema.prisma (see the comment there). Additive only.

-- 1. The payment ledger accepts the new kind: amount only, no plan, period or placement.
ALTER TABLE "SubscriptionPayment" DROP CONSTRAINT "SubscriptionPayment_kind_fields_check";
ALTER TABLE "SubscriptionPayment"
  ADD CONSTRAINT "SubscriptionPayment_kind_fields_check" CHECK (
    (
      "kind" = 'SUBSCRIPTION'
      AND "planCode" IS NOT NULL
      AND "durationMonths" IS NOT NULL
      AND "periodStart" IS NOT NULL
      AND "periodEnd" IS NOT NULL
      AND "promotionDays" IS NULL
      AND "promotionScope" IS NULL
    )
    OR (
      "kind" = 'PROMOTION'
      AND "promotionDays" IS NOT NULL
      AND "promotionScope" IS NOT NULL
      AND "planCode" IS NULL
      AND "durationMonths" IS NULL
      AND "periodStart" IS NULL
      AND "periodEnd" IS NULL
    )
    OR (
      "kind" = 'WALLET_TOPUP'
      AND "planCode" IS NULL
      AND "durationMonths" IS NULL
      AND "periodStart" IS NULL
      AND "periodEnd" IS NULL
      AND "promotionDays" IS NULL
      AND "promotionScope" IS NULL
    )
  );

-- 2. Balance per app driver.
CREATE TABLE "DriverWallet" (
  "driverId"   INTEGER NOT NULL,
  "balanceAmd" INTEGER NOT NULL DEFAULT 0,
  "updatedAt"  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "DriverWallet_pkey" PRIMARY KEY ("driverId"),
  CONSTRAINT "DriverWallet_driverId_fkey" FOREIGN KEY ("driverId")
    REFERENCES "FleetDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 3. The ledger.
CREATE TYPE "WalletEntryKind" AS ENUM (
  'TOPUP',                -- money in through Idram (paymentId)
  'ORDER_FEE',            -- charged when an order is accepted (assignmentId)
  'ORDER_FEE_ADJUSTMENT', -- the fee settled to the final price (either sign)
  'ORDER_FEE_REFUND',     -- an operator cancelled / took the order away before arrival
  'ADMIN_CREDIT',         -- by hand, with a note (cash, goodwill, correction)
  'ADMIN_DEBIT'
);

CREATE TABLE "WalletEntry" (
  "id"              BIGSERIAL NOT NULL,
  "driverId"        INTEGER NOT NULL,
  "kind"            "WalletEntryKind" NOT NULL,
  "amountAmd"       INTEGER NOT NULL,
  "balanceAfterAmd" INTEGER NOT NULL,
  "orderId"         INTEGER,
  "assignmentId"    INTEGER,
  "paymentId"       INTEGER,
  -- On ORDER_FEE: the fee schedule in force at accept, so later settlements
  -- use the terms the driver accepted under, not whatever the console says now.
  "feeRules"        JSONB,
  "note"            TEXT,
  "createdByUserId" INTEGER,
  "createdAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WalletEntry_driverId_fkey" FOREIGN KEY ("driverId")
    REFERENCES "FleetDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WalletEntry_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "DispatchOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WalletEntry_assignmentId_fkey" FOREIGN KEY ("assignmentId")
    REFERENCES "OrderAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WalletEntry_paymentId_fkey" FOREIGN KEY ("paymentId")
    -- SET NULL, not RESTRICT: deleting a tow truck (which cascades to its
    -- payments) must never be blocked by the app wallet's history.
    REFERENCES "SubscriptionPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WalletEntry_amount_nonzero_check" CHECK ("amountAmd" <> 0),
  -- The sign follows the kind; only an adjustment may go either way.
  CONSTRAINT "WalletEntry_sign_check" CHECK (
    ("kind" IN ('TOPUP', 'ORDER_FEE_REFUND', 'ADMIN_CREDIT') AND "amountAmd" > 0)
    OR ("kind" IN ('ORDER_FEE', 'ADMIN_DEBIT') AND "amountAmd" < 0)
    OR "kind" = 'ORDER_FEE_ADJUSTMENT'
  ),
  -- Only a top-up names a payment (its payment may later be deleted with the truck).
  CONSTRAINT "WalletEntry_payment_kind_check" CHECK ("paymentId" IS NULL OR "kind" = 'TOPUP'),
  CONSTRAINT "WalletEntry_admin_note_check" CHECK ("kind" NOT IN ('ADMIN_CREDIT', 'ADMIN_DEBIT') OR ("note" IS NOT NULL AND "createdByUserId" IS NOT NULL))
);
-- A payment credits once (Idram retries callbacks); an assignment is charged once and refunded once.
CREATE UNIQUE INDEX "WalletEntry_paymentId_key" ON "WalletEntry" ("paymentId") WHERE "paymentId" IS NOT NULL;
CREATE UNIQUE INDEX "WalletEntry_one_fee_per_assignment" ON "WalletEntry" ("assignmentId") WHERE "kind" = 'ORDER_FEE';
CREATE UNIQUE INDEX "WalletEntry_one_refund_per_assignment" ON "WalletEntry" ("assignmentId") WHERE "kind" = 'ORDER_FEE_REFUND';
CREATE INDEX "WalletEntry_driver_createdAt_idx" ON "WalletEntry" ("driverId", "createdAt" DESC, "id" DESC);
CREATE INDEX "WalletEntry_assignmentId_idx" ON "WalletEntry" ("assignmentId") WHERE "assignmentId" IS NOT NULL;

-- 4. Which app driver an Idram top-up bill is for.
CREATE TABLE "WalletTopup" (
  "paymentId" INTEGER NOT NULL,
  "driverId"  INTEGER NOT NULL,
  CONSTRAINT "WalletTopup_pkey" PRIMARY KEY ("paymentId"),
  CONSTRAINT "WalletTopup_paymentId_fkey" FOREIGN KEY ("paymentId")
    REFERENCES "SubscriptionPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WalletTopup_driverId_fkey" FOREIGN KEY ("driverId")
    REFERENCES "FleetDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WalletTopup_driverId_idx" ON "WalletTopup" ("driverId");
