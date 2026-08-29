-- Admin-only "last payment received" bookkeeping — see TowTruck.lastPaymentAt.
--
-- Nullable, additive, no backfill: every existing row simply reads as "no
-- payment recorded yet", which is true.
ALTER TABLE "TowTruck" ADD COLUMN IF NOT EXISTS "lastPaymentAt" TIMESTAMP(3);
