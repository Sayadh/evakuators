-- Driver wallet, second round (2026-11-12): a bonus credited with a large
-- top-up is its own ledger line. Own migration: a new enum value cannot be
-- used in the transaction that adds it (the next migration's CHECK uses it).
ALTER TYPE "WalletEntryKind" ADD VALUE IF NOT EXISTS 'TOPUP_BONUS';
