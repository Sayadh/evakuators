-- Referred orders (2026-11-17). `referrerDriverId` = the driver who handed the
-- order to the platform (set by an operator). When the order is completed by
-- ANOTHER driver, the referrer is credited walletReferralSharePercent of the
-- order's fee (orders.repository.ts creditReferrer). A deleted driver leaves
-- the order, not the history: SET NULL.
ALTER TABLE "DispatchOrder" ADD COLUMN "referrerDriverId" INTEGER;
ALTER TABLE "DispatchOrder" ADD CONSTRAINT "DispatchOrder_referrerDriverId_fkey"
  FOREIGN KEY ("referrerDriverId") REFERENCES "FleetDriver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DispatchOrder_referrer_idx" ON "DispatchOrder" ("referrerDriverId") WHERE "referrerDriverId" IS NOT NULL;
-- At most one referral credit per order, whatever retries or races happen
CREATE UNIQUE INDEX "WalletEntry_one_referral_per_order" ON "WalletEntry" ("orderId") WHERE "kind" = 'REFERRAL_CREDIT';
-- A referral credit is always money IN for the referrer
ALTER TABLE "WalletEntry" DROP CONSTRAINT "WalletEntry_sign_check";
ALTER TABLE "WalletEntry"
  ADD CONSTRAINT "WalletEntry_sign_check" CHECK (
    ("kind" IN ('TOPUP', 'TOPUP_BONUS', 'ORDER_FEE_REFUND', 'ADMIN_CREDIT', 'REFERRAL_CREDIT') AND "amountAmd" > 0)
    OR ("kind" IN ('ORDER_FEE', 'ADMIN_DEBIT') AND "amountAmd" < 0)
    OR "kind" = 'ORDER_FEE_ADJUSTMENT'
  );
