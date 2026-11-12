-- Driver wallet top-ups (2026-11-12) go through the SAME payment ledger and
-- the same Idram bill numbers as subscriptions and placements (see
-- SubscriptionPayment.kind). Its own migration because a new enum value
-- cannot be used in the transaction that adds it; the next migration uses it.
ALTER TYPE "PaymentKind" ADD VALUE IF NOT EXISTS 'WALLET_TOPUP';
