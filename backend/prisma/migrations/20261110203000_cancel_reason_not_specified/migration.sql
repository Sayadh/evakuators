-- A driver who asks to cancel an accepted order and picks no reason within
-- the time limit (product decision, 2026-11) — the app then sends
-- NOT_SPECIFIED, and the order goes to the next driver automatically.
-- Only the driver-request path accepts it (order-input.ts); an operator's
-- cancel still requires a real reason.
--
-- Additive only. ADD VALUE inside a transaction is fine on PostgreSQL ≥ 12 as
-- long as the new value is not USED in the same transaction — it is not.
ALTER TYPE "OrderCancelReason" ADD VALUE IF NOT EXISTS 'NOT_SPECIFIED';
