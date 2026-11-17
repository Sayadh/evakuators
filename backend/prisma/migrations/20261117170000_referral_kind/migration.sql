-- Referred orders (2026-11-17): a driver hands an order to the platform, the
-- platform keeps its share of the fee and credits the rest to him. Its own
-- migration because a new enum value cannot be USED (the index in the next
-- migration) in the transaction that adds it.
ALTER TYPE "WalletEntryKind" ADD VALUE IF NOT EXISTS 'REFERRAL_CREDIT';
